import { useEffect, useState } from 'react';
import { api } from '../api/client';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const emptyLine = () => ({ description: '', quantity: 1, unitPrice: '', itemId: '' });

const STATUS_STYLES = {
  draft: { bg: '#f1f1f1', fg: 'var(--cb-text-secondary)' },
  sent: { bg: '#faeeda', fg: '#854f0b' },
  accepted: { bg: '#e1f5ee', fg: '#085041' },
  declined: { bg: '#faece7', fg: '#993c1d' },
  converted: { bg: 'var(--cb-primary-50)', fg: 'var(--cb-primary-800)' },
};

export default function Quotes() {
  const [customers, setCustomers] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [items, setItems] = useState([]);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState(false);
  const [costCentresEnabled, setCostCentresEnabled] = useState(false);
  const [currencies, setCurrencies] = useState([]);
  const [costCentres, setCostCentres] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState('GHS');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [actingOn, setActingOn] = useState(null);

  const [form, setForm] = useState({
    customerId: '',
    quoteDate: new Date().toISOString().slice(0, 10),
    expiryDate: '',
    taxRatePercent: 0,
    currency: '',
    costCentreId: '',
    notes: '',
    lines: [emptyLine()],
  });

  function load() {
    api.listCustomers().then((r) => {
      setCustomers(r.customers);
      setForm((f) => (f.customerId ? f : { ...f, customerId: r.customers[0]?.id || '' }));
    }).catch((err) => setError(err.message));
    api.listQuotes().then((r) => setQuotes(r.quotes)).catch((err) => setError(err.message));
    api.listInventoryItems().then((r) => setItems(r.items.filter((i) => i.is_active))).catch(() => {});
    api.listCurrencies().then((r) => setCurrencies(r.currencies)).catch(() => {});
    api.listCostCentres().then((r) => setCostCentres(r.costCentres)).catch(() => {});
    api.getCompany().then((c) => {
      setInventoryEnabled(!!c.inventoryEnabled);
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
  function pickItemForLine(index, itemId) {
    const item = items.find((i) => i.id === itemId);
    const lines = form.lines.map((l, i) => (i === index
      ? { ...l, itemId, description: item ? item.name : l.description, unitPrice: item ? (item.sale_price ?? item.cost_price) : l.unitPrice }
      : l));
    setForm({ ...form, lines });
  }

  const subtotal = form.lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const isForeign = multiCurrencyEnabled && form.currency && form.currency !== baseCurrency;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const payload = {
        customerId: form.customerId, quoteDate: form.quoteDate, expiryDate: form.expiryDate || undefined,
        incomeCategory: 'Sales', taxRatePercent: Number(form.taxRatePercent || 0), notes: form.notes || undefined,
        lines: form.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), itemId: l.itemId || undefined })),
        ...(isForeign ? { currency: form.currency } : {}),
        ...(costCentresEnabled && form.costCentreId ? { costCentreId: form.costCentreId } : {}),
      };
      const result = await api.createQuote(payload);
      setForm((f) => ({ ...f, expiryDate: '', notes: '', lines: [emptyLine()] }));
      setNotice(`Saved as ${result.quoteNumber} — draft. Mark it "sent" once it's gone to the customer.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(quote, status) {
    setActingOn(quote.id);
    setError('');
    try {
      await api.updateQuoteStatus(quote.id, status);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActingOn(null);
    }
  }

  async function handleConvert(quote) {
    setActingOn(quote.id);
    setError('');
    setNotice('');
    try {
      const result = await api.convertQuote(quote.id);
      setNotice(`Converted to ${result.invoiceNumber} (${currency(result.total)}). Find it on the Sales page.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Quotes</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 16 }}>
        Propose a price before you invoice — a quote never touches the books until you convert it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20 }}>
        <form onSubmit={handleSubmit} style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>New quote</div>

          <label style={labelStyle}>
            Customer
            <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} style={inputStyle} required>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <label style={labelStyle}>
              Quote date
              <input type="date" value={form.quoteDate} onChange={(e) => setForm({ ...form, quoteDate: e.target.value })} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Expires (optional)
              <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} style={inputStyle} />
            </label>
          </div>

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
            <label style={labelStyle}>
              Currency
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} style={inputStyle}>
                <option value="">{baseCurrency} (base)</option>
                {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </label>
          )}

          <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 4 }}>
            Line items{inventoryEnabled && ' — link a stock item to carry it through on conversion'}
          </div>
          {form.lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {inventoryEnabled && (
                <select value={line.itemId} onChange={(e) => pickItemForLine(i, e.target.value)} style={inputStyle}>
                  <option value="">No stock item (freeform line)</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ''}</option>)}
                </select>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px', gap: 6 }}>
                <input placeholder="Description" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} style={inputStyle} required disabled={!!line.itemId} />
                <input type="number" min="1" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} style={inputStyle} />
                <input type="number" min="0" step="0.01" placeholder="Price" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} style={inputStyle} required />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} style={ghostButtonStyle}>+ Add line</button>

          <label style={labelStyle}>
            Tax rate (%)
            <input type="number" min="0" step="0.5" value={form.taxRatePercent} onChange={(e) => setForm({ ...form, taxRatePercent: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Notes (optional)
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inputStyle} />
          </label>

          <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--cb-border)' }}>
            <span style={{ color: 'var(--cb-text-secondary)' }}>Subtotal</span>
            <span style={{ fontWeight: 600 }}>{isForeign ? `${form.currency} ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : currency(subtotal)}</span>
          </div>

          {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}
          {notice && <div style={{ color: 'var(--cb-success)', fontSize: 13 }}>✓ {notice}</div>}

          <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Save quote'}</button>
        </form>

        <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>All quotes</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
                <th style={thStyle}>Quote</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Date</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const s = STATUS_STYLES[q.status] || STATUS_STYLES.draft;
                const busy = actingOn === q.id;
                return (
                  <tr key={q.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                    <td style={tdStyle}>{q.quote_number}</td>
                    <td style={tdStyle}>{q.customer_name}</td>
                    <td style={tdStyle}>
                      {q.quote_date}
                      {q.isExpired && <div style={{ fontSize: 10, color: 'var(--cb-danger)' }}>expired</div>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(q.total)}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.fg }}>{q.status}</span>
                      {q.converted_invoice_number && <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)', marginTop: 2 }}>{q.converted_invoice_number}</div>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {q.status === 'draft' && (
                          <button type="button" disabled={busy} onClick={() => setStatus(q, 'sent')} style={ghostButtonStyle}>Mark sent</button>
                        )}
                        {q.status === 'sent' && (
                          <>
                            <button type="button" disabled={busy} onClick={() => setStatus(q, 'accepted')} style={ghostButtonStyle}>Mark accepted</button>
                            <button type="button" disabled={busy} onClick={() => setStatus(q, 'declined')} style={ghostButtonStyle}>Mark declined</button>
                          </>
                        )}
                        {(q.status === 'sent' || q.status === 'accepted') && (
                          <button type="button" disabled={busy} onClick={() => handleConvert(q)} style={{ ...buttonStyle, marginTop: 0, padding: '6px 10px' }}>Convert to invoice</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {quotes.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No quotes yet.</div>}
        </div>
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
