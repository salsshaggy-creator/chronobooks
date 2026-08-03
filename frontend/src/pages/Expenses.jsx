import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/client';
import Attachments from '../components/Attachments';

const CATEGORIES = ['Fuel', 'Utilities', 'Rent', 'Office Supplies', 'Marketing', 'Bank Charges', 'Miscellaneous'];

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const emptyForm = () => ({
  expenseType: 'general',
  expenseDate: new Date().toISOString().slice(0, 10),
  category: 'Fuel',
  paidFromAccountCode: '1010',
  amount: '',
  reference: '',
  description: '',
  destination: '',
  days: '',
  dailyRate: '',
  currency: '',
  exchangeRate: '',
  costCentreId: '',
});

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState('GHS');
  const [currencies, setCurrencies] = useState([]);
  const [costCentresEnabled, setCostCentresEnabled] = useState(false);
  const [costCentres, setCostCentres] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  function load() {
    api.listExpenses().then((r) => setExpenses(r.expenses)).catch((err) => setError(err.message));
    api.getCompany().then((c) => {
      setMultiCurrencyEnabled(!!c.multiCurrencyEnabled);
      setBaseCurrency(c.currency || 'GHS');
      setCostCentresEnabled(!!c.costCentresEnabled);
      setForm((f) => (f.currency ? f : { ...f, currency: c.currency || 'GHS' }));
    }).catch(() => {});
    api.listCurrencies().then((r) => setCurrencies(r.currencies)).catch(() => {});
    api.listCostCentres().then((r) => setCostCentres(r.costCentres)).catch(() => {});
  }

  useEffect(load, []);

  const isPerDiem = form.expenseType === 'per_diem';
  const perDiemAmount = Math.round(Number(form.days || 0) * Number(form.dailyRate || 0) * 100) / 100;
  const isForeign = !isPerDiem && multiCurrencyEnabled && form.currency && form.currency !== baseCurrency;
  const previewRate = Number(form.exchangeRate) || 0;
  const previewBaseAmount = isForeign && previewRate > 0 ? Number(form.amount || 0) * previewRate : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const payload = isPerDiem
        ? { expenseType: 'per_diem', expenseDate: form.expenseDate, paidFromAccountCode: form.paidFromAccountCode, destination: form.destination, days: Number(form.days), dailyRate: Number(form.dailyRate), description: form.description, reference: form.reference, costCentreId: form.costCentreId }
        : { ...form, amount: Number(form.amount) };
      if (!isPerDiem) {
        if (!isForeign) { delete payload.currency; delete payload.exchangeRate; }
        else if (!payload.exchangeRate) delete payload.exchangeRate;
      }
      const result = await api.createExpense(payload);
      setForm((f) => ({ ...emptyForm(), expenseType: f.expenseType, currency: f.currency }));
      if (result.pendingApproval) setNotice(result.message);
      else if (result.foreignTotal != null) setNotice(`Posted as ${currency(result.amount)} (${result.currency} ${Number(result.foreignTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} at rate ${result.exchangeRate}).`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--cb-surface)',
          border: '1px solid var(--cb-border)',
          borderRadius: 'var(--cb-radius)',
          padding: 18,
          alignSelf: 'start',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Record expense</div>
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>
          No debits or credits to pick — ChronoBooks posts the balanced entry for you.
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {[{ v: 'general', l: 'General' }, { v: 'per_diem', l: 'Per Diem' }].map((t) => (
            <button
              key={t.v} type="button" onClick={() => setForm({ ...emptyForm(), expenseType: t.v })}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                border: form.expenseType === t.v ? '2px solid var(--cb-primary-600)' : '1px solid var(--cb-border)',
                background: form.expenseType === t.v ? 'var(--cb-primary-50)' : 'transparent',
              }}
            >
              {t.l}
            </button>
          ))}
        </div>

        <label style={labelStyle}>
          Date
          <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} style={inputStyle} required />
        </label>

        {isPerDiem ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>Approval routing (if enabled in Settings → Approvals) applies to Per Diem claims specifically.</div>
            <label style={labelStyle}>
              Destination
              <input type="text" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Number of days
              <input type="number" min="0.5" step="0.5" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Daily rate (GHS)
              <input type="number" min="0" step="0.01" value={form.dailyRate} onChange={(e) => setForm({ ...form, dailyRate: e.target.value })} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Paid from
              <select value={form.paidFromAccountCode} onChange={(e) => setForm({ ...form, paidFromAccountCode: e.target.value })} style={inputStyle}>
                <option value="1010">Main Bank Account</option>
                <option value="1000">Cash</option>
              </select>
            </label>
            <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--cb-border)' }}>
              <span style={{ color: 'var(--cb-text-secondary)' }}>Claim amount</span>
              <span style={{ fontWeight: 600 }}>{currency(perDiemAmount)}</span>
            </div>
          </>
        ) : (
          <>
            <label style={labelStyle}>
              Category
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            {multiCurrencyEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: isForeign ? '1fr 1fr' : '1fr', gap: 6 }}>
                <label style={labelStyle}>
                  Currency
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, exchangeRate: '' })} style={inputStyle}>
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                  </select>
                </label>
                {isForeign && (
                  <label style={labelStyle}>
                    Rate to {baseCurrency} (blank = auto)
                    <input type="number" min="0" step="0.0001" placeholder="auto" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} style={inputStyle} />
                  </label>
                )}
              </div>
            )}

            <label style={labelStyle}>
              Amount {isForeign ? `(${form.currency})` : '(GHS)'}
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle} required />
            </label>
            {isForeign && previewBaseAmount != null && (
              <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>≈ {currency(previewBaseAmount)} at rate {previewRate}</div>
            )}
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

        <label style={labelStyle}>
          Reference
          <input type="text" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Description
          <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} />
        </label>

        {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}
        {notice && <div style={{ color: 'var(--cb-amber-600)', fontSize: 13, background: '#faeeda', borderRadius: 8, padding: '8px 10px' }}>⏳ {notice}</div>}

        <button type="submit" disabled={saving} style={buttonStyle}>
          {saving ? 'Saving…' : isPerDiem ? 'Submit per diem claim' : 'Record expense'}
        </button>
      </form>

      <div
        style={{
          background: 'var(--cb-surface)',
          border: '1px solid var(--cb-border)',
          borderRadius: 'var(--cb-radius)',
          padding: 18,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Recent expenses</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Paid from</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <Fragment key={e.id}>
              <tr style={{ borderTop: '1px solid var(--cb-border)' }}>
                <td style={tdStyle}>{e.expense_date}</td>
                <td style={tdStyle}>
                  {e.category}
                  {e.expense_type === 'per_diem' && (
                    <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, color: 'var(--cb-primary-800)', background: 'var(--cb-primary-50)', borderRadius: 999, padding: '2px 7px' }}>PER DIEM</span>
                  )}
                </td>
                <td style={tdStyle}>{e.paid_from_name}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {currency(e.amount)}
                  {e.currency && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)' }}>{e.currency} {Number(e.foreign_total).toLocaleString(undefined, { minimumFractionDigits: 2 })} @ {e.exchange_rate}</div>}
                  {e.cost_centre_code && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)' }}>{e.cost_centre_code}</div>}
                </td>
                <td style={tdStyle}>
                  <button type="button" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)} style={ghostButtonStyle} title="Attachments">
                    📎
                  </button>
                </td>
              </tr>
              {expandedId === e.id && (
                <tr>
                  <td colSpan={5} style={{ padding: '0 0 10px' }}>
                    <Attachments entityType="expense" entityId={e.id} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {expenses.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No expenses recorded yet.</div>}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)' };
const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '8px 10px',
  border: '1px solid var(--cb-border)',
  borderRadius: 8,
  fontSize: 14,
};
const buttonStyle = {
  marginTop: 6,
  padding: '10px 14px',
  border: 'none',
  borderRadius: 8,
  background: 'var(--cb-primary-400)',
  color: 'var(--cb-primary-900)',
  fontWeight: 600,
  fontSize: 14,
};
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px' };
const ghostButtonStyle = { padding: '6px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, background: 'transparent', color: 'var(--cb-primary-800)', fontSize: 12, fontWeight: 600 };
