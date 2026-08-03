import { useEffect, useState } from 'react';
import { api } from '../api/client';

const currency = (n) => `${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Budgets() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [accounts, setAccounts] = useState([]);
  const [edits, setEdits] = useState({}); // `${accountId}:${period}` -> amount
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setError('');
    setEdits({});
    api.getBudgets(year).then((r) => setAccounts(r.accounts)).catch((err) => setError(err.message));
  }

  useEffect(load, [year]);

  function cellValue(account, period) {
    const key = `${account.accountId}:${period}`;
    return key in edits ? edits[key] : account.months[period];
  }

  function setCell(account, period, value) {
    setEdits((e) => ({ ...e, [`${account.accountId}:${period}`]: value }));
  }

  function rowTotal(account) {
    return MONTH_LABELS.reduce((sum, _, i) => {
      const period = `${year}-${String(i + 1).padStart(2, '0')}`;
      return sum + Number(cellValue(account, period) || 0);
    }, 0);
  }

  const income = accounts.filter((a) => a.type === 'income');
  const expenses = accounts.filter((a) => a.type === 'expense');
  const grandTotal = accounts.reduce((sum, a) => sum + rowTotal(a) * (a.type === 'income' ? 1 : -1), 0);

  async function handleSave() {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const entries = Object.entries(edits).map(([key, amount]) => {
        const [accountId, period] = key.split(':');
        return { accountId, period, amount: Number(amount || 0) };
      });
      if (entries.length === 0) {
        setNotice('Nothing changed.');
      } else {
        const result = await api.saveBudgets(year, entries);
        setNotice(`Saved ${result.saved} cell(s).`);
        load();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function renderSection(title, rows) {
    return (
      <>
        <tr><td colSpan={14} style={{ padding: '10px 8px 4px', fontSize: 12, fontWeight: 700, color: 'var(--cb-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</td></tr>
        {rows.map((a) => (
          <tr key={a.accountId} style={{ borderTop: '1px solid var(--cb-border)' }}>
            <td style={{ ...tdStyle, position: 'sticky', left: 0, background: 'var(--cb-surface)', minWidth: 160 }}>{a.name}</td>
            {MONTH_LABELS.map((_, i) => {
              const period = `${year}-${String(i + 1).padStart(2, '0')}`;
              return (
                <td key={period} style={{ padding: 2 }}>
                  <input
                    type="number" min="0" step="1"
                    value={cellValue(a, period)}
                    onChange={(e) => setCell(a, period, e.target.value)}
                    style={cellInputStyle}
                  />
                </td>
              );
            })}
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{currency(rowTotal(a))}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={14} style={{ padding: '4px 8px', fontSize: 12, color: 'var(--cb-text-secondary)' }}>No accounts.</td></tr>}
      </>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Budgets</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={() => setYear((y) => y - 1)} style={ghostButtonStyle}>← {year - 1}</button>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{year}</span>
          <button type="button" onClick={() => setYear((y) => y + 1)} style={ghostButtonStyle}>{year + 1} →</button>
          <button type="button" onClick={handleSave} disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 4, marginBottom: 16 }}>
        Set a planned amount per account per month. Nothing here posts to the books — it's purely a plan, compared against actuals on Reports → Budget vs Actual.
      </p>

      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {notice && <div style={{ color: 'var(--cb-primary-800)', fontSize: 13, marginBottom: 12, background: 'var(--cb-primary-50)', borderRadius: 8, padding: '8px 10px' }}>{notice}</div>}

      <div style={{ ...cardStyle, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={{ ...thStyle, position: 'sticky', left: 0, background: 'var(--cb-surface)' }}>Account</th>
              {MONTH_LABELS.map((m) => <th key={m} style={{ ...thStyle, textAlign: 'center', minWidth: 70 }}>{m}</th>)}
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {renderSection('Income', income)}
            {renderSection('Expenses', expenses)}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600 }}>
        Planned net profit for {year}: <span style={{ color: grandTotal >= 0 ? 'var(--cb-success)' : 'var(--cb-danger)' }}>{currency(grandTotal)}</span>
      </div>
    </div>
  );
}

const buttonStyle = { padding: '9px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const ghostButtonStyle = { padding: '6px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, background: 'transparent', color: 'var(--cb-primary-800)', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const cardStyle = { background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '6px 8px', verticalAlign: 'middle' };
const cellInputStyle = { width: 62, padding: '4px 5px', border: '1px solid var(--cb-border)', borderRadius: 6, fontSize: 12, textAlign: 'right' };
