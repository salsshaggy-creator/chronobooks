import { useEffect, useState } from 'react';
import { api } from '../api/client';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const emptyForm = () => ({ name: '', assetNumber: '', category: '', purchaseDate: new Date().toISOString().slice(0, 10), purchaseCost: '', salvageValue: 0, usefulLifeMonths: 60, paidFromAccountCode: '1010' });

export default function FixedAssets() {
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const [depAsOf, setDepAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [depRunning, setDepRunning] = useState(false);

  const [disposingId, setDisposingId] = useState(null);
  const [disposeForm, setDisposeForm] = useState({ disposalDate: new Date().toISOString().slice(0, 10), proceeds: 0, depositToAccountCode: '1010' });
  const [disposeError, setDisposeError] = useState('');

  const [historyFor, setHistoryFor] = useState(null);
  const [movements, setMovements] = useState([]);
  const [payableAccounts, setPayableAccounts] = useState([]);

  function load() {
    api.listFixedAssets().then((r) => setAssets(r.assets)).catch((err) => setError(err.message));
    api.listPayableFromAccounts().then((r) => setPayableAccounts(r.accounts)).catch(() => {});
  }

  useEffect(load, []);

  const activeAssets = assets.filter((a) => a.status === 'active');
  const totalNetBookValue = activeAssets.reduce((sum, a) => sum + Number(a.netBookValue || 0), 0);
  const totalMonthlyDep = activeAssets.reduce((sum, a) => sum + Number(a.monthlyDepreciation || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await api.createFixedAsset(form);
      setForm(emptyForm());
      setShowForm(false);
      setNotice('Asset registered.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRunDepreciation() {
    setError('');
    setNotice('');
    setDepRunning(true);
    try {
      const result = await api.runDepreciation(depAsOf);
      if (result.assetsDepreciated.length === 0) {
        setNotice('Nothing to depreciate — every asset is up to date as of this date.');
      } else {
        setNotice(`Posted ${currency(result.totalAmount)} of depreciation across ${result.assetsDepreciated.length} asset(s).`);
      }
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDepRunning(false);
    }
  }

  function startDispose(asset) {
    setDisposingId(asset.id);
    setDisposeForm({ disposalDate: new Date().toISOString().slice(0, 10), proceeds: 0, depositToAccountCode: '1010' });
    setDisposeError('');
  }

  async function confirmDispose(asset) {
    setDisposeError('');
    try {
      const result = await api.disposeFixedAsset(asset.id, disposeForm);
      setDisposingId(null);
      setNotice(`Disposed "${asset.name}" — ${result.gainLoss >= 0 ? 'gain' : 'loss'} of ${currency(Math.abs(result.gainLoss))} recognized.`);
      load();
    } catch (err) {
      setDisposeError(err.message);
    }
  }

  async function viewHistory(asset) {
    setHistoryFor(asset.id);
    try {
      const r = await api.listFixedAssetMovements(asset.id);
      setMovements(r.movements);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Fixed Assets</h1>
        <button type="button" onClick={() => setShowForm((v) => !v)} style={buttonStyle}>+ Register asset</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 4, marginBottom: 16 }}>
        Equipment, vehicles, furniture — things the business owns long-term. Registering one posts Debit Fixed Assets automatically; running depreciation each period spreads its cost evenly (straight-line) over its useful life; disposing of it clears the books and recognizes any gain or loss.
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Active assets</div>
          <div style={statValueStyle}>{activeAssets.length}</div>
        </div>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Net book value</div>
          <div style={statValueStyle}>{currency(totalNetBookValue)}</div>
        </div>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Monthly depreciation</div>
          <div style={statValueStyle}>{currency(totalMonthlyDep)}</div>
        </div>
        <div style={{ ...statCardStyle, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 280 }}>
          <div style={statLabelStyle}>Run depreciation</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="date" value={depAsOf} onChange={(e) => setDepAsOf(e.target.value)} style={{ ...inputStyle, marginTop: 0 }} />
            <button type="button" onClick={handleRunDepreciation} disabled={depRunning} style={{ ...buttonStyle, padding: '8px 12px' }}>{depRunning ? 'Running…' : 'Run'}</button>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--cb-text-secondary)', lineHeight: 1.4 }}>
            Posts straight-line depreciation directly to the ledger for every active asset (Debit Depreciation Expense, Credit Accumulated Depreciation) — nothing to post manually via Journal Entries.
          </div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16, alignItems: 'end' }}>
          <label style={labelStyle}>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Asset # (optional)<input value={form.assetNumber} onChange={(e) => setForm({ ...form, assetNumber: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Category (optional)<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Purchase date<input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Purchase cost<input type="number" min="0" step="0.01" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Salvage value<input type="number" min="0" step="0.01" value={form.salvageValue} onChange={(e) => setForm({ ...form, salvageValue: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Useful life (months)<input type="number" min="1" step="1" value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>
            Paid from
            <select value={form.paidFromAccountCode} onChange={(e) => setForm({ ...form, paidFromAccountCode: e.target.value })} style={inputStyle} required>
              {payableAccounts.length === 0 && <option value={form.paidFromAccountCode}>Loading…</option>}
              {payableAccounts.map((acc) => <option key={acc.id} value={acc.code}>{acc.name} ({acc.group_name})</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Register asset'}</button>
            <button type="button" onClick={() => setShowForm(false)} style={ghostButtonStyle}>Cancel</button>
          </div>
        </form>
      )}

      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {notice && <div style={{ color: 'var(--cb-primary-800)', fontSize: 13, marginBottom: 12, background: 'var(--cb-primary-50)', borderRadius: 8, padding: '8px 10px' }}>{notice}</div>}

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Asset</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Accum. dep.</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Net book value</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <>
                <tr key={a.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                  <td style={tdStyle}>
                    {a.name}
                    {a.fullyDepreciated && a.status === 'active' && <span style={fullyDepPillStyle}>FULLY DEPRECIATED</span>}
                    <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>{a.category || '—'} · {a.asset_number || 'no tag'} · {a.purchase_date}</div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(a.purchase_cost)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(a.accumulated_depreciation)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{currency(a.netBookValue)}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: a.status === 'active' ? '#e1f5ee' : '#f0f0f0', color: a.status === 'active' ? '#085041' : '#666' }}>
                      {a.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {a.status === 'active' && <button type="button" onClick={() => startDispose(a)} style={ghostButtonStyle}>Dispose</button>}
                  </td>
                  <td style={tdStyle}>
                    <button type="button" onClick={() => viewHistory(a)} style={ghostButtonStyle}>History</button>
                  </td>
                </tr>
                {disposingId === a.id && (
                  <tr key={a.id + '-dispose'}>
                    <td colSpan={7} style={{ padding: '0 8px 12px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--cb-bg)', borderRadius: 10, padding: 12 }}>
                        <label style={labelStyle}>Disposal date<input type="date" value={disposeForm.disposalDate} onChange={(e) => setDisposeForm({ ...disposeForm, disposalDate: e.target.value })} style={{ ...inputStyle, width: 140 }} /></label>
                        <label style={labelStyle}>Proceeds<input type="number" min="0" step="0.01" value={disposeForm.proceeds} onChange={(e) => setDisposeForm({ ...disposeForm, proceeds: e.target.value })} style={{ ...inputStyle, width: 110 }} /></label>
                        <label style={labelStyle}>
                          Deposited to
                          <select value={disposeForm.depositToAccountCode} onChange={(e) => setDisposeForm({ ...disposeForm, depositToAccountCode: e.target.value })} style={{ ...inputStyle, width: 160 }}>
                            {payableAccounts.map((acc) => <option key={acc.id} value={acc.code}>{acc.name}</option>)}
                          </select>
                        </label>
                        <button type="button" onClick={() => confirmDispose(a)} style={{ ...buttonStyle, padding: '9px 14px' }}>Confirm disposal</button>
                        <button type="button" onClick={() => setDisposingId(null)} style={ghostButtonStyle}>Cancel</button>
                      </div>
                      {disposeError && <div style={{ color: 'var(--cb-danger)', fontSize: 12, marginTop: 6 }}>{disposeError}</div>}
                    </td>
                  </tr>
                )}
                {historyFor === a.id && (
                  <tr key={a.id + '-history'}>
                    <td colSpan={7} style={{ padding: '0 8px 12px' }}>
                      <div style={{ background: 'var(--cb-bg)', borderRadius: 10, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>Depreciation history</div>
                          <button type="button" onClick={() => setHistoryFor(null)} style={{ ...ghostButtonStyle, padding: '2px 8px' }}>Close</button>
                        </div>
                        {movements.length === 0 && <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)' }}>No depreciation posted yet.</div>}
                        {movements.map((m) => (
                          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--cb-border)' }}>
                            <span>{m.period_start} → {m.period_end}</span>
                            <span style={{ fontWeight: 600 }}>{currency(m.amount)}</span>
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
        {assets.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No assets registered yet.</div>}
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
const fullyDepPillStyle = { fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: '#faeeda', color: '#854f0b' };
