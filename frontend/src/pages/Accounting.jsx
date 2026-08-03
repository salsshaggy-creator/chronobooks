import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/client';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const emptyLine = () => ({ accountId: '', debit: '', credit: '' });
const TABS = ['General Ledger', 'Journal Entries'];

export default function Accounting({ canPost }) {
  const [tab, setTab] = useState('General Ledger');
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { api.listChartOfAccounts().then((r) => setAccounts(r.accounts)).catch((err) => setError(err.message)); }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Accounting</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 16 }}>
        The engine underneath every module — every business event you've recorded, in accounting form.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid var(--cb-border)',
            background: tab === t ? 'var(--cb-primary-400)' : 'var(--cb-surface)',
            color: tab === t ? 'var(--cb-primary-900)' : 'var(--cb-text-primary)', fontWeight: 600, fontSize: 13,
          }}>{t}</button>
        ))}
      </div>

      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {tab === 'General Ledger' && <GeneralLedger accounts={accounts} />}
      {tab === 'Journal Entries' && <JournalEntries accounts={accounts} canPost={canPost} />}
    </div>
  );
}

function GeneralLedger({ accounts }) {
  const [accountId, setAccountId] = useState('');
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (accounts.length > 0 && !accountId) setAccountId(accounts[0].id);
  }, [accounts]);

  useEffect(() => {
    if (!accountId) return;
    api.getLedger(accountId).then(setLedger).catch((err) => setError(err.message));
  }, [accountId]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
      <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 10, alignSelf: 'start', maxHeight: 560, overflowY: 'auto' }}>
        {accounts.map((a) => (
          <button
            key={a.id}
            onClick={() => setAccountId(a.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none',
              background: accountId === a.id ? 'var(--cb-primary-50)' : 'transparent',
              color: accountId === a.id ? 'var(--cb-primary-800)' : 'var(--cb-text-primary)',
              fontSize: 13, marginBottom: 2,
            }}
          >
            <span style={{ color: 'var(--cb-text-secondary)' }}>{a.code}</span> {a.name}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 }}>
        {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}
        {ledger && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{ledger.account.code} — {ledger.account.name}</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{currency(ledger.closingBalance)}</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Description</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Debit</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Credit</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.lines.map((l) => (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                    <td style={tdStyle}>{l.entry_date}</td>
                    <td style={tdStyle}>{l.description}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{l.debit ? currency(l.debit) : ''}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{l.credit ? currency(l.credit) : ''}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(l.runningBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ledger.lines.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No activity on this account yet.</div>}
          </>
        )}
      </div>
    </div>
  );
}

function JournalEntries({ accounts, canPost }) {
  const [entries, setEntries] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [expandedLines, setExpandedLines] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entryDate: new Date().toISOString().slice(0, 10), reference: '', description: '', lines: [emptyLine(), emptyLine()] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() { api.listJournalEntries().then((r) => setEntries(r.entries)).catch((err) => setError(err.message)); }
  useEffect(load, []);

  async function toggleExpand(entryId) {
    if (expanded === entryId) { setExpanded(null); return; }
    const r = await api.getJournalEntry(entryId);
    setExpandedLines(r.lines);
    setExpanded(entryId);
  }

  function updateLine(i, field, value) {
    setForm({ ...form, lines: form.lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)) });
  }

  const totalDebit = form.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced = form.lines.length >= 2 && totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.createManualJournalEntry(form);
      setForm({ entryDate: new Date().toISOString().slice(0, 10), reference: '', description: '', lines: [emptyLine(), emptyLine()] });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {canPost && (
        <button type="button" onClick={() => setShowForm((v) => !v)} style={{ ...buttonStyle, marginBottom: 14 }}>
          {showForm ? 'Cancel' : '+ New manual journal entry'}
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 16, marginBottom: 16, maxWidth: 760 }}>
          <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 10 }}>
            The escape hatch for anything the other modules don't cover — corrections, adjustments. Debits and credits must balance before this can be posted.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <label style={labelStyle}>Date<input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} style={inputStyle} required /></label>
            <label style={labelStyle}>Reference<input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} style={inputStyle} /></label>
            <label style={labelStyle}>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} /></label>
          </div>

          {form.lines.map((line, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px', gap: 6, marginBottom: 6 }}>
              <select value={line.accountId} onChange={(e) => updateLine(i, 'accountId', e.target.value)} style={inputStyle} required>
                <option value="">Select account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
              <input type="number" min="0" step="0.01" placeholder="Debit" value={line.debit} onChange={(e) => updateLine(i, 'debit', e.target.value)} style={inputStyle} />
              <input type="number" min="0" step="0.01" placeholder="Credit" value={line.credit} onChange={(e) => updateLine(i, 'credit', e.target.value)} style={inputStyle} />
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} style={ghostButtonStyle}>+ Add line</button>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--cb-border)' }}>
            <span>Debit total: <strong>{currency(totalDebit)}</strong></span>
            <span>Credit total: <strong>{currency(totalCredit)}</strong></span>
            <span style={{ color: isBalanced ? 'var(--cb-success)' : 'var(--cb-danger)' }}>{isBalanced ? '✓ Balanced' : 'Not balanced yet'}</span>
          </div>

          {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}

          <button type="submit" disabled={!isBalanced || saving} style={{ ...buttonStyle, marginTop: 10 }}>{saving ? 'Posting…' : 'Post entry'}</button>
        </form>
      )}

      <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Source</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <Fragment key={e.id}>
                <tr onClick={() => toggleExpand(e.id)} style={{ borderTop: '1px solid var(--cb-border)', cursor: 'pointer' }}>
                  <td style={tdStyle}>{e.entry_date}</td>
                  <td style={tdStyle}>{e.description}</td>
                  <td style={tdStyle}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--cb-primary-50)', color: 'var(--cb-primary-800)' }}>{e.source_type}</span></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(e.total)}</td>
                </tr>
                {expanded === e.id && (
                  <tr>
                    <td colSpan={4} style={{ padding: '4px 8px 12px 24px', background: 'var(--cb-bg)' }}>
                      {expandedLines.map((l, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                          <span>{l.code} — {l.name}</span>
                          <span>{l.debit ? `Dr ${currency(l.debit)}` : `Cr ${currency(l.credit)}`}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No journal entries yet.</div>}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 12, color: 'var(--cb-text-secondary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '7px 9px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 13 };
const buttonStyle = { padding: '9px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 13 };
const ghostButtonStyle = { padding: '6px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, background: 'transparent', color: 'var(--cb-primary-800)', fontSize: 12, fontWeight: 600 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px' };
