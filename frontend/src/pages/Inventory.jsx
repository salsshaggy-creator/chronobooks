import { useEffect, useState } from 'react';
import { api } from '../api/client';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const emptyForm = () => ({ name: '', sku: '', unit: 'unit', category: '', salePrice: '', reorderLevel: 0, openingQuantity: 0, openingCost: '' });

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);

  const [adjustingId, setAdjustingId] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ quantityDelta: '', unitCost: '', reason: '' });
  const [adjustError, setAdjustError] = useState('');

  const [historyFor, setHistoryFor] = useState(null);
  const [movements, setMovements] = useState([]);

  function load() {
    api.listInventoryItems().then((r) => setItems(r.items)).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  const totalValue = items.reduce((sum, i) => sum + Number(i.stockValue || 0), 0);
  const lowStockCount = items.filter((i) => i.lowStock).length;

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      name: item.name, sku: item.sku || '', unit: item.unit, category: item.category || '',
      salePrice: item.sale_price ?? '', reorderLevel: item.reorder_level, openingQuantity: 0, openingCost: '',
    });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      if (editingId) {
        await api.updateInventoryItem(editingId, form);
        setNotice('Item updated.');
      } else {
        await api.createInventoryItem(form);
        setNotice('Item added.');
      }
      setShowForm(false);
      setForm(emptyForm());
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startAdjust(item) {
    setAdjustingId(item.id);
    setAdjustForm({ quantityDelta: '', unitCost: '', reason: '' });
    setAdjustError('');
  }

  async function submitAdjust(item) {
    setAdjustError('');
    try {
      await api.adjustInventoryStock(item.id, {
        quantityDelta: Number(adjustForm.quantityDelta),
        unitCost: adjustForm.unitCost === '' ? undefined : Number(adjustForm.unitCost),
        reason: adjustForm.reason,
      });
      setAdjustingId(null);
      load();
    } catch (err) {
      setAdjustError(err.message);
    }
  }

  async function viewHistory(item) {
    setHistoryFor(item.id);
    try {
      const r = await api.listInventoryMovements(item.id);
      setMovements(r.movements);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Inventory</h1>
        <button type="button" onClick={startNew} style={buttonStyle}>+ Add item</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 4, marginBottom: 16 }}>
        Items you stock and sell. Receiving stock on a Purchases bill (category "Inventory") and issuing stock on a Sales invoice both update quantity and cost automatically — Cost of Goods Sold posts itself.
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Items tracked</div>
          <div style={statValueStyle}>{items.length}</div>
        </div>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Stock value on hand</div>
          <div style={statValueStyle}>{currency(totalValue)}</div>
        </div>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Low stock</div>
          <div style={{ ...statValueStyle, color: lowStockCount > 0 ? 'var(--cb-danger)' : undefined }}>{lowStockCount}</div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16, alignItems: 'end' }}>
          <label style={labelStyle}>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>SKU (optional)<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={inputStyle} placeholder="e.g. pcs, kg, box" /></label>
          <label style={labelStyle}>Category (optional)<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Sale price (optional)<input type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Reorder level<input type="number" min="0" step="0.01" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} style={inputStyle} /></label>
          {!editingId && (
            <>
              <label style={labelStyle}>Opening quantity<input type="number" min="0" step="0.01" value={form.openingQuantity} onChange={(e) => setForm({ ...form, openingQuantity: e.target.value })} style={inputStyle} /></label>
              <label style={labelStyle}>Opening cost / unit<input type="number" min="0" step="0.01" value={form.openingCost} onChange={(e) => setForm({ ...form, openingCost: e.target.value })} style={inputStyle} /></label>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add item'}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} style={ghostButtonStyle}>Cancel</button>
          </div>
        </form>
      )}

      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {notice && <div style={{ color: 'var(--cb-primary-800)', fontSize: 13, marginBottom: 12, background: 'var(--cb-primary-50)', borderRadius: 8, padding: '8px 10px' }}>{notice}</div>}

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>SKU</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>On hand</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Avg cost</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Value</th>
              <th style={thStyle}></th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <>
                <tr key={item.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                  <td style={tdStyle}>
                    {item.name}
                    {item.lowStock && <span style={lowStockPillStyle}>LOW STOCK</span>}
                    {!item.is_active && <span style={{ fontSize: 11, color: 'var(--cb-text-secondary)', marginLeft: 6 }}>(inactive)</span>}
                    <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>{item.category || '—'} · {item.unit}</div>
                  </td>
                  <td style={tdStyle}>{item.sku || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(item.quantity_on_hand).toLocaleString()}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(item.cost_price)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(item.stockValue)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => startEdit(item)} style={ghostButtonStyle}>Edit</button>
                      <button type="button" onClick={() => startAdjust(item)} style={ghostButtonStyle}>Adjust</button>
                      <button type="button" onClick={() => viewHistory(item)} style={ghostButtonStyle}>History</button>
                    </div>
                  </td>
                </tr>
                {adjustingId === item.id && (
                  <tr key={item.id + '-adjust'}>
                    <td colSpan={6} style={{ padding: '0 8px 12px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--cb-bg)', borderRadius: 10, padding: 12 }}>
                        <label style={labelStyle}>Quantity change (+/-)<input type="number" step="0.01" value={adjustForm.quantityDelta} onChange={(e) => setAdjustForm({ ...adjustForm, quantityDelta: e.target.value })} style={{ ...inputStyle, width: 110 }} /></label>
                        <label style={labelStyle}>Unit cost (if increasing)<input type="number" min="0" step="0.01" value={adjustForm.unitCost} onChange={(e) => setAdjustForm({ ...adjustForm, unitCost: e.target.value })} style={{ ...inputStyle, width: 110 }} /></label>
                        <label style={{ ...labelStyle, flex: 1 }}>Reason<input value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} style={inputStyle} required placeholder="e.g. stock take, damaged, found" /></label>
                        <button type="button" onClick={() => submitAdjust(item)} style={{ ...buttonStyle, padding: '9px 14px' }}>Save</button>
                        <button type="button" onClick={() => setAdjustingId(null)} style={ghostButtonStyle}>Cancel</button>
                      </div>
                      {adjustError && <div style={{ color: 'var(--cb-danger)', fontSize: 12, marginTop: 6 }}>{adjustError}</div>}
                    </td>
                  </tr>
                )}
                {historyFor === item.id && (
                  <tr key={item.id + '-history'}>
                    <td colSpan={6} style={{ padding: '0 8px 12px' }}>
                      <div style={{ background: 'var(--cb-bg)', borderRadius: 10, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>Stock movements</div>
                          <button type="button" onClick={() => setHistoryFor(null)} style={{ ...ghostButtonStyle, padding: '2px 8px' }}>Close</button>
                        </div>
                        {movements.length === 0 && <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>No movements yet.</div>}
                        {movements.map((m) => (
                          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--cb-border)' }}>
                            <span>{String(m.created_at).slice(0, 16)} · {m.movement_type} · {m.reference || '—'}</span>
                            <span style={{ fontWeight: 600, color: Number(m.quantity) >= 0 ? 'var(--cb-primary-800)' : 'var(--cb-danger)' }}>
                              {Number(m.quantity) >= 0 ? '+' : ''}{Number(m.quantity).toLocaleString()} @ {currency(m.unit_cost)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No items yet — add your first one above.</div>}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 14 };
const buttonStyle = { padding: '9px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const ghostButtonStyle = { padding: '6px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, background: 'transparent', color: 'var(--cb-primary-800)', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const cardStyle = { background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px', verticalAlign: 'top' };
const statCardStyle = { ...cardStyle, padding: 14, minWidth: 160 };
const statLabelStyle = { fontSize: 12, color: 'var(--cb-text-secondary)' };
const statValueStyle = { fontSize: 20, fontWeight: 700, marginTop: 4 };
const lowStockPillStyle = { fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: '#faece7', color: '#993c1d' };
