import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/client';
import Attachments from '../components/Attachments';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const emptyLine = () => ({ description: '', quantity: 1, unitPrice: '', itemId: '' });

export default function Sales() {
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
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
    customerId: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    incomeCategory: 'Sales',
    taxRatePercent: 0,
    currency: '',
    exchangeRate: '',
    costCentreId: '',
    lines: [emptyLine()],
  });

  const [receiptFor, setReceiptFor] = useState(null); // invoice id currently receiving payment
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' });
  const [newCustomerError, setNewCustomerError] = useState('');
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);

  function load() {
    api.listCustomers().then((r) => {
      setCustomers(r.customers);
      setForm((f) => (f.customerId ? f : { ...f, customerId: r.customers[0]?.id || '' }));
    }).catch((err) => setError(err.message));
    api.listInvoices().then((r) => setInvoices(r.invoices)).catch((err) => setError(err.message));
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
      ? { ...l, itemId, description: item ? item.name : l.description, unitPrice: item ? (item.sale_price ?? item.cost_price) : l.unitPrice }
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
      const result = await api.createInvoice(payload);
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

  async function handleCreateCustomer(e) {
    e.preventDefault();
    setNewCustomerError('');
    if (!newCustomer.name.trim()) { setNewCustomerError('Customer name is required.'); return; }
    setNewCustomerSaving(true);
    try {
      const result = await api.createCustomer({ name: newCustomer.name.trim(), email: newCustomer.email || undefined, phone: newCustomer.phone || undefined });
      const r = await api.listCustomers();
      setCustomers(r.customers);
      setForm((f) => ({ ...f, customerId: result.id }));
      setNewCustomer({ name: '', email: '', phone: '' });
      setNewCustomerOpen(false);
    } catch (err) {
      setNewCustomerError(err.message);
    } finally {
      setNewCustomerSaving(false);
    }
  }

  async function handleReceipt(invoiceId) {
    setReceiptError('');
    setNotice('');
    try {
      const result = await api.createReceipt({
        invoiceId,
        receiptDate: new Date().toISOString().slice(0, 10),
        depositedToAccountCode: '1010',
        amount: Number(receiptAmount),
        paymentMethod: 'Bank transfer',
      });
      setReceiptFor(null);
      setReceiptAmount('');
      if (result.pendingApproval) setNotice(result.message);
      load();
    } catch (err) {
      setReceiptError(err.message);
    }
  }

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
      <form
        onSubmit={handleSubmit}
        style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Raise invoice</div>
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>
          Pick a customer and list what you sold — Accounts Receivable and Sales post automatically.
        </div>

        <label style={labelStyle}>
          Customer
          <select
            value={form.customerId}
            onChange={(e) => {
              if (e.target.value === '__new__') { setNewCustomerOpen(true); return; }
              setForm({ ...form, customerId: e.target.value });
            }}
            style={inputStyle}
            required
          >
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new__">+ Add new customer…</option>
          </select>
        </label>

        {newCustomerOpen && (
          <div style={{ border: '1px solid var(--cb-border)', borderRadius: 8, padding: 12, background: 'var(--cb-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>New customer</div>
            <label style={labelStyle}>
              Name
              <input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Customer name" style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Email (optional)
              <input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} placeholder="customer@email.com" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Phone (optional)
              <input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="Phone number" style={inputStyle} />
            </label>
            {newCustomerError && <div style={{ color: 'var(--cb-danger)', fontSize: 12.5 }}>{newCustomerError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleCreateCustomer} disabled={newCustomerSaving} style={{ ...buttonStyle, marginTop: 0, flex: 1 }}>
                {newCustomerSaving ? 'Saving…' : 'Save customer'}
              </button>
              <button type="button" onClick={() => { setNewCustomerOpen(false); setNewCustomerError(''); }} style={{ ...ghostButtonStyle, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <label style={labelStyle}>
          Invoice date
          <input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} style={inputStyle} required />
        </label>

        <label style={labelStyle}>
          Due date
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} style={inputStyle} />
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
          Line items{inventoryEnabled && ' — link a stock item to issue it and post Cost of Goods Sold'}
          {isForeign && ` — amounts in ${form.currency}`}
        </div>
        {form.lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {inventoryEnabled && (
              <select value={line.itemId} onChange={(e) => pickItemForLine(i, e.target.value)} style={inputStyle}>
                <option value="">No stock item (freeform line)</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ''} — {Number(it.quantity_on_hand).toLocaleString()} on hand</option>)}
              </select>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px', gap: 6 }}>
              <input placeholder="Description" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} style={inputStyle} required disabled={!!line.itemId} />
              <input type="number" min="1" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} style={inputStyle} />
              <input type="number" min="0" step="0.01" placeholder="Price" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} style={inputStyle} required />
            </div>
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

        <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Raise invoice'}</button>
      </form>

      <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Invoices</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Invoice</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Date</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Outstanding</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const outstanding = Number(inv.total) - Number(inv.paid);
              return (
              <Fragment key={inv.id}>
                <tr style={{ borderTop: '1px solid var(--cb-border)' }}>
                  <td style={tdStyle}>{inv.invoice_number}</td>
                  <td style={tdStyle}>{inv.customer_name}</td>
                  <td style={tdStyle}>{inv.invoice_date}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {currency(inv.total)}
                    {inv.currency && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)' }}>{inv.currency} {Number(inv.foreign_total).toLocaleString(undefined, { minimumFractionDigits: 2 })} @ {inv.exchange_rate}</div>}
                    {inv.cost_centre_code && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)' }}>{inv.cost_centre_code}</div>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(outstanding)}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: inv.status === 'paid' ? '#e1f5ee' : '#faeeda', color: inv.status === 'paid' ? '#085041' : '#854f0b' }}>
                      {inv.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {outstanding > 0 && (
                      receiptFor === inv.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={outstanding}
                            placeholder="Amount"
                            value={receiptAmount}
                            onChange={(e) => setReceiptAmount(e.target.value)}
                            style={{ ...inputStyle, width: 80, marginTop: 0 }}
                          />
                          <button type="button" onClick={() => handleReceipt(inv.id)} style={{ ...buttonStyle, marginTop: 0, padding: '6px 10px' }}>Save</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setReceiptFor(inv.id); setReceiptAmount(String(outstanding)); }} style={ghostButtonStyle}>
                          Record receipt
                        </button>
                      )
                    )}
                  </td>
                  <td style={tdStyle}>
                    <button type="button" onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)} style={ghostButtonStyle} title="Attachments">
                      📎
                    </button>
                  </td>
                </tr>
                {expandedId === inv.id && (
                  <tr>
                    <td colSpan={8} style={{ padding: '0 0 10px' }}>
                      <Attachments entityType="invoice" entityId={inv.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
        {receiptError && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginTop: 8 }}>{receiptError}</div>}
        {notice && <div style={{ color: 'var(--cb-amber-600)', fontSize: 13, marginTop: 8, background: '#faeeda', borderRadius: 8, padding: '8px 10px' }}>⏳ {notice}</div>}
        {invoices.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No invoices yet.</div>}
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
