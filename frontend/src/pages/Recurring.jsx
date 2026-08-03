import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/client';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const BILL_CATEGORIES = ['Fuel', 'Utilities', 'Rent', 'Office Supplies', 'Marketing', 'Bank Charges', 'Miscellaneous'];
const EXPENSE_CATEGORIES = ['Fuel', 'Utilities', 'Rent', 'Office Supplies', 'Marketing', 'Bank Charges', 'Miscellaneous'];
const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly', label: 'Yearly' },
];
const TYPE_LABELS = { invoice: 'Invoice', bill: 'Bill', expense: 'Expense' };

const emptyLine = () => ({ description: '', quantity: 1, unitPrice: '' });

const emptyForm = () => ({
  type: 'expense',
  name: '',
  frequency: 'monthly',
  startDate: today(),
  endDate: '',
  dueDays: '',
  customerId: '',
  supplierId: '',
  billCategory: 'Rent',
  taxRatePercent: 0,
  currency: '',
  exchangeRate: '',
  costCentreId: '',
  lines: [emptyLine()],
  expenseCategory: 'Rent',
  paidFromAccountCode: '1010',
  amount: '',
  tax: '',
  reference: '',
  description: '',
});

export default function Recurring() {
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [costCentres, setCostCentres] = useState([]);
  const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState(false);
  const [costCentresEnabled, setCostCentresEnabled] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState('GHS');
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runNotice, setRunNotice] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [runs, setRuns] = useState([]);

  function load() {
    api.listRecurring().then((r) => setItems(r.recurringTransactions)).catch((err) => setError(err.message));
    api.listCustomers().then((r) => setCustomers(r.customers)).catch(() => {});
    api.listSuppliers().then((r) => setSuppliers(r.suppliers)).catch(() => {});
    api.listCurrencies().then((r) => setCurrencies(r.currencies)).catch(() => {});
    api.listCostCentres().then((r) => setCostCentres(r.costCentres)).catch(() => {});
    api.getCompany().then((c) => {
      setMultiCurrencyEnabled(!!c.multiCurrencyEnabled);
      setCostCentresEnabled(!!c.costCentresEnabled);
      setBaseCurrency(c.currency || 'GHS');
    }).catch(() => {});
  }
  useEffect(load, []);

  function updateLine(index, field, value) {
    const lines = form.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l));
    setForm({ ...form, lines });
  }

  const isForeign = multiCurrencyEnabled && form.currency && form.currency !== baseCurrency;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      let payload;
      if (form.type === 'invoice') {
        payload = {
          customerId: form.customerId, incomeCategory: 'Sales', taxRatePercent: Number(form.taxRatePercent || 0),
          lines: form.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
        };
      } else if (form.type === 'bill') {
        payload = {
          supplierId: form.supplierId, expenseCategory: form.billCategory, taxRatePercent: Number(form.taxRatePercent || 0),
          lines: form.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
        };
      } else {
        payload = {
          category: form.expenseCategory, paidFromAccountCode: form.paidFromAccountCode, amount: Number(form.amount),
          tax: Number(form.tax || 0), reference: form.reference, description: form.description,
        };
      }
      if (isForeign) {
        payload.currency = form.currency;
        if (form.exchangeRate) payload.exchangeRate = Number(form.exchangeRate);
      }
      if (costCentresEnabled && form.costCentreId) payload.costCentreId = form.costCentreId;

      await api.createRecurring({
        type: form.type, name: form.name, frequency: form.frequency, startDate: form.startDate,
        endDate: form.endDate || undefined, dueDays: form.dueDays !== '' ? Number(form.dueDays) : undefined,
        payload,
      });
      setForm(emptyForm());
      setNotice('Recurring transaction created.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item) {
    try {
      await api.updateRecurring(item.id, { isActive: !item.isActive });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRunDue() {
    setRunning(true);
    setRunNotice('');
    setError('');
    try {
      const result = await api.runDueRecurring(today());
      setRunNotice(
        result.totalOccurrencesPosted === 0
          ? 'Nothing was due — everything is already up to date.'
          : `Posted ${result.totalOccurrencesPosted} occurrence(s) across ${result.processed.length} recurring transaction(s).`
      );
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function toggleExpand(item) {
    if (expanded === item.id) {
      setExpanded(null);
      return;
    }
    setExpanded(item.id);
    try {
      const r = await api.listRecurringRuns(item.id);
      setRuns(r.runs);
    } catch {
      setRuns([]);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Recurring Transactions</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 16 }}>
        Set up an invoice, bill, or expense once and let it auto-post on a schedule — rent, subscriptions,
        retainer invoices. Nothing posts until you (or a scheduled check) hits "Run due now" below.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <button type="button" onClick={handleRunDue} disabled={running} style={buttonStyle}>
          {running ? 'Running…' : 'Run due now'}
        </button>
        {runNotice && <div style={{ fontSize: 13, color: 'var(--cb-success)' }}>✓ {runNotice}</div>}
      </div>
      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20 }}>
        <form onSubmit={handleSubmit} style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>New recurring transaction</div>

          <div style={{ display: 'flex', gap: 6 }}>
            {['expense', 'invoice', 'bill'].map((t) => (
              <button
                key={t} type="button" onClick={() => setForm({ ...emptyForm(), type: t })}
                style={{
                  flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  border: form.type === t ? '2px solid var(--cb-primary-600)' : '1px solid var(--cb-border)',
                  background: form.type === t ? 'var(--cb-primary-50)' : 'transparent',
                }}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <label style={labelStyle}>
            Name
            <input placeholder='e.g. "Monthly office rent"' value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} required />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <label style={labelStyle}>
              Frequency
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} style={inputStyle}>
                {FREQUENCIES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Start date
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inputStyle} required />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <label style={labelStyle}>
              End date (optional)
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} style={inputStyle} />
            </label>
            {form.type !== 'expense' && (
              <label style={labelStyle}>
                Due in (days, optional)
                <input type="number" min="0" value={form.dueDays} onChange={(e) => setForm({ ...form, dueDays: e.target.value })} style={inputStyle} />
              </label>
            )}
          </div>

          {form.type === 'invoice' && (
            <>
              <label style={labelStyle}>
                Customer
                <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} style={inputStyle} required>
                  <option value="">Select…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </>
          )}
          {form.type === 'bill' && (
            <>
              <label style={labelStyle}>
                Supplier
                <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} style={inputStyle} required>
                  <option value="">Select…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Category
                <select value={form.billCategory} onChange={(e) => setForm({ ...form, billCategory: e.target.value })} style={inputStyle}>
                  {BILL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </>
          )}
          {form.type === 'expense' && (
            <>
              <label style={labelStyle}>
                Category
                <select value={form.expenseCategory} onChange={(e) => setForm({ ...form, expenseCategory: e.target.value })} style={inputStyle}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Paid from
                <select value={form.paidFromAccountCode} onChange={(e) => setForm({ ...form, paidFromAccountCode: e.target.value })} style={inputStyle}>
                  <option value="1010">Main Bank Account</option>
                  <option value="1000">Cash</option>
                </select>
              </label>
            </>
          )}

          {costCentresEnabled && costCentres.length > 0 && (
            <label style={labelStyle}>
              Cost centre
              <select value={form.costCentreId} onChange={(e) => setForm({ ...form, costCentreId: e.target.value })} style={inputStyle}>
                <option value="">— none —</option>
                {costCentres.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>)}
              </select>
            </label>
          )}

          {(form.type === 'invoice' || form.type === 'bill') && multiCurrencyEnabled && (
            <div style={{ display: 'grid', gridTemplateColumns: isForeign ? '1fr 1fr' : '1fr', gap: 6 }}>
              <label style={labelStyle}>
                Currency
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, exchangeRate: '' })} style={inputStyle}>
                  <option value="">{baseCurrency} (base)</option>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </select>
              </label>
              {isForeign && (
                <label style={labelStyle}>
                  Rate (blank = auto each run)
                  <input type="number" min="0" step="0.0001" placeholder="auto" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} style={inputStyle} />
                </label>
              )}
            </div>
          )}

          {(form.type === 'invoice' || form.type === 'bill') && (
            <>
              <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 4 }}>Line items</div>
              {form.lines.map((line, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px', gap: 6 }}>
                  <input placeholder="Description" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} style={inputStyle} required />
                  <input type="number" min="1" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} style={inputStyle} />
                  <input type="number" min="0" step="0.01" placeholder="Price" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} style={inputStyle} required />
                </div>
              ))}
              <button type="button" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} style={ghostButtonStyle}>+ Add line</button>
              <label style={labelStyle}>
                Tax rate (%)
                <input type="number" min="0" step="0.5" value={form.taxRatePercent} onChange={(e) => setForm({ ...form, taxRatePercent: e.target.value })} style={inputStyle} />
              </label>
            </>
          )}

          {form.type === 'expense' && (
            <>
              <label style={labelStyle}>
                Amount {isForeign ? `(${form.currency})` : '(GHS)'}
                <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle} required />
              </label>
              <label style={labelStyle}>
                Reference
                <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Description
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} />
              </label>
            </>
          )}

          {notice && <div style={{ color: 'var(--cb-success)', fontSize: 13 }}>✓ {notice}</div>}

          <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Create recurring transaction'}</button>
        </form>

        <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>All recurring transactions</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Frequency</th>
                <th style={thStyle}>Next run</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                <th style={thStyle}>Posted</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Fragment key={item.id}>
                  <tr style={{ borderTop: '1px solid var(--cb-border)' }}>
                    <td style={tdStyle}>
                      <button type="button" onClick={() => toggleExpand(item)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
                        {item.name}
                        {item.subject && <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>{item.subject}</div>}
                      </button>
                    </td>
                    <td style={tdStyle}>{TYPE_LABELS[item.type]}</td>
                    <td style={tdStyle}>{FREQUENCIES.find((f) => f.key === item.frequency)?.label}</td>
                    <td style={tdStyle}>{item.isActive ? item.nextRunDate : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(item.amount)}</td>
                    <td style={tdStyle}>{item.occurrencesPosted}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: item.isActive ? '#e1f5ee' : '#f1f1f1', color: item.isActive ? '#085041' : 'var(--cb-text-secondary)' }}>
                        {item.isActive ? 'active' : 'paused'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <button type="button" onClick={() => toggleActive(item)} style={ghostButtonStyle}>{item.isActive ? 'Pause' : 'Resume'}</button>
                    </td>
                  </tr>
                  {expanded === item.id && (
                    <tr>
                      <td colSpan={8} style={{ padding: '4px 8px 12px', background: 'var(--cb-primary-50)', borderRadius: 8 }}>
                        {runs.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>No occurrences posted yet.</div>
                        ) : (
                          runs.map((r) => (
                            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                              <span>{r.run_date}</span>
                              <span style={{ fontWeight: 600 }}>{currency(r.amount)}</span>
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No recurring transactions set up yet.</div>}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 14 };
const buttonStyle = { padding: '10px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 14 };
const ghostButtonStyle = { padding: '6px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, background: 'transparent', color: 'var(--cb-primary-800)', fontSize: 12, fontWeight: 600 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px' };
