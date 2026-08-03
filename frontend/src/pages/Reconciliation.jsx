import { useEffect, useState } from 'react';
import { api } from '../api/client';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const SOURCE_LABELS = {
  deposit: 'Deposit', withdrawal: 'Withdrawal', transfer: 'Transfer', bank_charge: 'Bank charge',
  interest: 'Interest', receipt: 'Customer receipt', supplier_payment: 'Supplier payment',
  expense: 'Expense', payroll: 'Payroll', manual: 'Journal entry', opening_balance: 'Opening balance',
};

export default function Reconciliation() {
  const [accounts, setAccounts] = useState([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [statementDate, setStatementDate] = useState(today());
  const [statementBalance, setStatementBalance] = useState('');
  const [state, setState] = useState(null); // { bookBalance, candidates }
  const [checked, setChecked] = useState(() => new Set());
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listBankAccounts().then((r) => {
      setAccounts(r.bankAccounts);
      setBankAccountId((id) => id || r.bankAccounts[0]?.id || '');
    }).catch((err) => setError(err.message));
  }, []);

  function loadState() {
    if (!bankAccountId) return;
    setError('');
    api.getReconciliationState(bankAccountId, statementDate).then((r) => {
      setState(r);
      setChecked(new Set());
    }).catch((err) => setError(err.message));
    api.listReconciliations(bankAccountId).then((r) => setHistory(r.reconciliations)).catch(() => {});
  }

  useEffect(loadState, [bankAccountId, statementDate]);

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const clearedTotal = state ? state.candidates.filter((c) => checked.has(c.id)).reduce((sum, c) => sum + c.amount, 0) : 0;
  const roundedClearedTotal = Math.round(clearedTotal * 100) / 100;
  const priorBalance = state ? state.priorBalance : 0;
  const newReconciledBalance = Math.round((priorBalance + roundedClearedTotal) * 100) / 100;
  const difference = Math.round((Number(statementBalance || 0) - newReconciledBalance) * 100) / 100;
  const balanced = statementBalance !== '' && Math.abs(difference) < 0.005;

  async function handleComplete() {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const result = await api.completeReconciliation(bankAccountId, {
        statementDate, statementBalance: Number(statementBalance), clearedJournalEntryIds: [...checked],
      });
      setNotice(`Reconciled — ${result.itemsCleared} item(s) cleared, ${currency(result.outstandingTotal)} still outstanding.`);
      setStatementBalance('');
      loadState();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const selectedAccount = accounts.find((a) => a.id === bankAccountId);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Bank Reconciliation</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 16 }}>
        Tick off everything that's actually cleared the bank as of your statement date — once the difference hits
        zero, you're reconciled. Cleared items never come back to bite you in a future reconciliation.
      </p>

      {accounts.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No bank accounts yet — add one on the Banking page first.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <label style={labelStyle}>
              Bank account
              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} style={inputStyle}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Statement date
              <input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Statement ending balance
              <input type="number" step="0.01" placeholder="From your bank statement" value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} style={{ ...inputStyle, width: 200 }} />
            </label>
          </div>

          {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          {notice && <div style={{ color: 'var(--cb-success)', fontSize: 13, marginBottom: 12, background: '#e1f5ee', borderRadius: 8, padding: '8px 10px' }}>✓ {notice}</div>}

          {state && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
              <div style={cardStyle}>
                <div style={cardTitleStyle}>
                  Uncleared transactions{selectedAccount ? ` — ${selectedAccount.name}` : ''}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
                      <th style={thStyle}></th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Description</th>
                      <th style={thStyle}>Type</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.candidates.map((c) => (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                        <td style={tdStyle}><input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} /></td>
                        <td style={tdStyle}>{c.date}</td>
                        <td style={tdStyle}>{c.description}</td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>{SOURCE_LABELS[c.sourceType] || c.sourceType}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: c.amount >= 0 ? 'var(--cb-success)' : 'var(--cb-danger)', fontWeight: 600 }}>
                          {c.amount >= 0 ? '+' : ''}{currency(c.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {state.candidates.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 8 }}>Nothing outstanding as of this date — fully caught up.</div>}
              </div>

              <div style={cardStyle}>
                <div style={cardTitleStyle}>Summary</div>
                <SummaryRow label="Book balance (as of statement date)" value={currency(state.bookBalance)} />
                <SummaryRow label="Previously reconciled to" value={currency(priorBalance)} />
                <SummaryRow label="+ Cleared this time (ticked above)" value={currency(roundedClearedTotal)} />
                <SummaryRow label="= New reconciled balance" value={currency(newReconciledBalance)} />
                <SummaryRow label="Statement balance" value={statementBalance !== '' ? currency(statementBalance) : '—'} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '10px 0', borderTop: '2px solid var(--cb-border)', marginTop: 8, fontWeight: 700, color: balanced ? 'var(--cb-success)' : 'var(--cb-danger)' }}>
                  <span>Difference</span>
                  <span>{statementBalance !== '' ? currency(difference) : '—'}</span>
                </div>
                {balanced && <div style={{ fontSize: 12, color: 'var(--cb-success)', marginTop: 4 }}>✓ Balanced — ready to complete.</div>}

                <button type="button" onClick={handleComplete} disabled={!balanced || saving} style={{ ...buttonStyle, width: '100%', marginTop: 14, opacity: !balanced || saving ? 0.5 : 1 }}>
                  {saving ? 'Saving…' : 'Complete reconciliation'}
                </button>
              </div>
            </div>
          )}

          <div style={{ ...cardStyle, marginTop: 20 }}>
            <div style={cardTitleStyle}>Reconciliation history</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
                  <th style={thStyle}>Statement date</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Statement balance</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Cleared</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Outstanding</th>
                  <th style={thStyle}>By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                    <td style={tdStyle}>{h.statement_date}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(h.statement_balance)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(h.cleared_total)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(h.outstanding_total)}</td>
                    <td style={tdStyle}>{h.created_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No reconciliations completed yet for this account.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
      <span style={{ color: 'var(--cb-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 14 };
const buttonStyle = { padding: '10px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 14 };
const cardStyle = { background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 };
const cardTitleStyle = { fontSize: 14, fontWeight: 600, marginBottom: 12 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px' };
