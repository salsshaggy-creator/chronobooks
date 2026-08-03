import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/client';
import Attachments from '../components/Attachments';

const CATEGORIES = ['Inventory', 'Fuel', 'Utilities', 'Rent', 'Office Supplies', 'Marketing', 'Bank Charges', 'Miscellaneous'];
const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const emptyLine = () => ({ description: '', quantity: 1, unitPrice: '', itemId: '' });

export default function Purchases() {
  const [suppliers, setSuppliers] = useState([]);
  const [bills, setBills] = useState([]);
  const [items, setItems] = useState([]);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState('GHS');
  const [currencies, setCurrencies] = useState([]);
  const [costCentresEnabled, setCostCentresEnabled] = useState(false);
  const [costCentres, setCostCentres] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    supplierId: '',
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    expenseCategory: 'Office Supplies',
    taxRatePercent: 0,
    currency: '',
    exchangeRate: '',
    costCentreId: '',
    lines: [emptyLine()],
  });

  const [paymentFor, setPaymentFor] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const isStockReceipt = form.expenseCategory === 'Inventory';

  function load() {
    api.listSuppliers().then((r) => {
      setSuppliers(r.suppliers);
      setForm((f) => (f.supplierId ? f : { ...f, supplierId: r.suppliers[0]?.id || '' }));
    }).catch((err) => setError(err.message));
    api.listBills().then((r) => setBills(r.bills)).catch((err) => setError(err.message));
    api.getCompany().then((c) => {
      setInventoryEnabled(!!c.inventoryEnabled);
      setMultiCurrencyEnabled(!!c.multiCurrencyEnabled);
      setBaseCurrency(c.currency || 'GHS');
      setCostCentresEnabled(!!c.costCentresEnabled);
      setForm((f) => (f.currency ? f : { ...f, currency: c.currency || 'GHS' }));
    }).catch(() => {});
    api.listInventoryItems().then((r) => setItems(r.items.filter((i) => i.is_active))).catch(() => {});
    api.listCurrencies().then((r) => setCurrencies(r.currencies)).catch(() => {});
    api.listCostCentres().then((r) => setCostCentres(r.costCentres)).catch(() => {});
  }

  useEffect(load, []);

  function updateLine(index, field, value) {
    const lines = form.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l));
    setForm({ ...form, lines });
  }

  function pickItemForLine(index, itemId) {
    const item = items.find((i) => i.id === itemId);
    const lines = form.lines.map((l, i) => (i === index
      ? { ...l, itemId, description: item ? item.name : l.description, unitPrice: item ? item.cost_price : l.unitPrice }
      : l));
    setForm({ ...form, lines });
  }

  const subtotal = form.lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const isForeign = multiCurrencyEnabled && form.currency && form.currency !== baseCurrency;
  const previewRate = Number(form.exchangeRate) || 0;
  const previewBaseTotal = isForeign && previewRate > 0 ? subtotal * previewRate : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const payload = { ...form };
      if (!isForeign) { delete payload.currency; delete payload.exchangeRate; }
      else if (!payload.exchangeRate) delete payload.exchangeRate;
      const result = await api.createBill(payload);
      setForm((f) => ({ ...f, dueDate: '', lines: [emptyLine()] }));
      if (result.pendingApproval) setNotice(result.message);
      else if (result.foreignTotal != null) setNotice(`Posted as ${currency(result.total)} (${result.currency} ${Number(result.foreignTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} at rate ${result.exchangeRate}).`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePayment(billId) {
    setPaymentError('');
    try {
      await api.createSupplierPayment({
        billId,
        paymentDate: new Date().toISOString().slice(0, 10),
        paidFromAccountCode: '1010',
        amount: Number(paymentAmount),
        paymentMethod: 'Bank transfer',
      });
      setPaymentFor(null);
      setPaymentAmount('');
      load();
    } catch (err) {
      setPaymentError(err.message);
    }
  }

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
      <form
        onSubmit={handleSubmit}
        style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Record supplier bill</div>
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>
          Pick a supplier and what the bill is for — Accounts Payable posts automatically.
        </div>

        <label style={labelStyle}>
          Supplier
          <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} style={inputStyle} required>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <label style={labelStyle}>
          Bill date
          <input type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} style={inputStyle} required />
        </label>

        <label style={labelStyle}>
          Due date
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Category
          <select
            value={form.expenseCategory}
            onChange={(e) => {
              const nextIsStock = e.target.value === 'Inventory';
              setForm({ ...form, expenseCategory: e.target.value, lines: nextIsStock !== isStockReceipt ? [emptyLine()] : form.lines });
            }}
            style={inputStyle}
          >
            {(inventoryEnabled ? CATEGORIES : CATEGORIES.filter((c) => c !== 'Inventory')).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        {costCentresEnabled && costCentres.length > 0 && (
          <label style={labelStyle}>
            Cost centre
            <select value={form.costCentreId} onChange={(e) => setForm({ ...form, costCentreId: e.target.value })} style={inputStyle}>
              <option value="">— none —</option>
              {costCentres.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>)}
            </select>
          </label>
        )}

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
                Rate to {baseCurrency} (blank = use Parameters)
                <input type="number" min="0" step="0.0001" placeholder="auto" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} style={inputStyle} />
              </label>
            )}
          </div>
        )}
        {isForeign && previewBaseTotal != null && (
          <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>≈ {currency(previewBaseTotal)} at rate {previewRate}</div>
        )}

        <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 4 }}>
          Line items{isStockReceipt && ' — picking an item receives stock at that unit cost'}
          {isForeign && ` — amounts in ${form.currency}`}
        </div>
        {form.lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: isStockReceipt ? '1fr 50px 70px' : '1fr 50px 70px', gap: 6 }}>
            {isStockReceipt ? (
              <select value={line.itemId} onChange={(e) => pickItemForLine(i, e.target.value)} style={inputStyle} required>
                <option value="">Select item…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ''}</option>)}
              </select>
            ) : (
              <input placeholder="Description" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} style={inputStyle} required />
            )}
            <input type="number" min="1" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} style={inputStyle} />
            <input type="number" min="0" step="0.01" placeholder="Cost/unit" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} style={inputStyle} required />
          </div>
        ))}
        <button type="button" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} style={ghostButtonStyle}>
          + Add line
        </button>

        <label style={labelStyle}>
          Tax rate (%)
          <input type="number" min="0" step="0.5" value={form.taxRatePercent} onChange={(e) => setForm({ ...form, taxRatePercent: e.target.value })} style={inputStyle} />
        </label>

        <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--cb-border)' }}>
          <span style={{ color: 'var(--cb-text-secondary)' }}>Subtotal</span>
          <span style={{ fontWeight: 600 }}>{isForeign ? `${form.currency} ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : currency(subtotal)}</span>
        </div>

        {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}
        {notice && <div style={{ color: 'var(--cb-amber-600)', fontSize: 13, background: '#faeeda', borderRadius: 8, padding: '8px 10px' }}>⏳ {notice}</div>}

        <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Record bill'}</button>
      </form>

      <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Bills</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Bill</th>
              <th style={thStyle}>Supplier</th>
              <th style={thStyle}>Date</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Outstanding</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => {
              const outstanding = Number(b.total) - Number(b.paid);
              return (
              <Fragment key={b.id}>
                <tr style={{ borderTop: '1px solid var(--cb-border)' }}>
                  <td style={tdStyle}>{b.bill_number}</td>
                  <td style={tdStyle}>{b.supplier_name}</td>
                  <td style={tdStyle}>{b.bill_date}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {currency(b.total)}
                    {b.currency && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)' }}>{b.currency} {Number(b.foreign_total).toLocaleString(undefined, { minimumFractionDigits: 2 })} @ {b.exchange_rate}</div>}
                    {b.cost_centre_code && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)' }}>{b.cost_centre_code}</div>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(outstanding)}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: b.status === 'paid' ? '#e1f5ee' : '#faeeda', color: b.status === 'paid' ? '#085041' : '#854f0b' }}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {outstanding > 0 && (
                      paymentFor === b.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={outstanding}
                            placeholder="Amount"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            style={{ ...inputStyle, width: 80, marginTop: 0 }}
                          />
                          <button type="button" onClick={() => handlePayment(b.id)} style={{ ...buttonStyle, marginTop: 0, padding: '6px 10px' }}>Save</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setPaymentFor(b.id); setPaymentAmount(String(outstanding)); }} style={ghostButtonStyle}>
                          Pay supplier
                        </button>
                      )
                    )}
                  </td>
                  <td style={tdStyle}>
                    <button type="button" onClick={() => setExpandedId(expandedId === b.id ? null : b.id)} style={ghostButtonStyle} title="Attachments">
                      📎
                    </button>
                  </td>
                </tr>
                {expandedId === b.id && (
                  <tr>
                    <td colSpan={8} style={{ padding: '0 0 10px' }}>
                      <Attachments entityType="bill" entityId={b.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
        {paymentError && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginTop: 8 }}>{paymentError}</div>}
        {bills.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No bills yet.</div>}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 14 };
const buttonStyle = { marginTop: 6, padding: '10px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 14 };
const ghostButtonStyle = { padding: '6px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, background: 'transparent', color: 'var(--cb-primary-800)', fontSize: 12, fontWeight: 600 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px' };
