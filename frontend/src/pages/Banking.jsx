import { useEffect, useState } from 'react';
import { api } from '../api/client';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const TXN_TYPES = [
  { key: 'deposit', label: 'Deposit cash', hint: 'Debit bank, credit cash' },
  { key: 'withdraw', label: 'Withdraw cash', hint: 'Debit cash, credit bank' },
  { key: 'transfer', label: 'Transfer between banks', hint: 'Debit destination, credit source' },
  { key: 'charge', label: 'Bank charge', hint: 'Debit bank charges expense, credit bank' },
  { key: 'interest', label: 'Interest earned', hint: 'Debit bank, credit interest income' },
];

const CURRENCIES = ['GHS', 'USD', 'NGN', 'GBP', 'EUR'];
const emptyAccount = { name: '', bankName: '', branch: '', accountNumber: '', currency: 'GHS', swiftCode: '', iban: '', mobileMoneyWallet: '', openingBalance: '', isDefault: false };

export default function Banking() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccount, setNewAccount] = useState(emptyAccount);

  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [renameError, setRenameError] = useState('');

  const [txnType, setTxnType] = useState('deposit');
  const [form, setForm] = useState({ bankAccountId: '', toBankAccountId: '', amount: '', date: today(), reference: '', description: '' });

  function load() {
    api.listBankAccounts().then((r) => {
      setAccounts(r.bankAccounts);
      setForm((f) => (f.bankAccountId ? f : { ...f, bankAccountId: r.bankAccounts[0]?.id || '' }));
    }).catch((err) => setError(err.message));
    api.listBankTransactions().then((r) => setTransactions(r.transactions)).catch(() => {});
  }

  useEffect(load, []);

  async function handleRename(id) {
    setRenameError('');
    if (!editingName.trim()) { setRenameError('Account name is required.'); return; }
    try {
      await api.updateBankAccount(id, { name: editingName.trim() });
      setEditingAccountId(null);
      load();
    } catch (err) {
      setRenameError(err.message);
    }
  }

  async function handleAddAccount(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createBankAccount(newAccount);
      setNewAccount(emptyAccount);
      setShowAddAccount(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTxnSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (txnType === 'deposit') await api.bankDeposit(payload);
      if (txnType === 'withdraw') await api.bankWithdraw(payload);
      if (txnType === 'charge') await api.bankCharge(payload);
      if (txnType === 'interest') await api.bankInterest(payload);
      if (txnType === 'transfer') await api.bankTransfer({ ...payload, fromBankAccountId: form.bankAccountId, toBankAccountId: form.toBankAccountId });
      setForm((f) => ({ ...f, amount: '', reference: '', description: '' }));
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Banking</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 16 }}>
        Deposits, withdrawals, transfers, charges, and interest — all posted as balanced entries automatically.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {accounts.map((a) => (
          <div key={a.id} style={{ background: 'var(--cb-surface)', border: a.isDefault ? '1px solid var(--cb-primary-400)' : '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: '14px 18px', minWidth: 210 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
              {editingAccountId === a.id ? (
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(a.id); if (e.key === 'Escape') setEditingAccountId(null); }}
                    autoFocus
                    style={{ flex: 1, fontSize: 13, padding: '3px 6px', border: '1px solid var(--cb-primary-400)', borderRadius: 6 }}
                  />
                  <button type="button" onClick={() => handleRename(a.id)} title="Save" style={{ border: 'none', background: 'transparent', color: 'var(--cb-primary-600)', fontWeight: 700, cursor: 'pointer' }}>✓</button>
                  <button type="button" onClick={() => setEditingAccountId(null)} title="Cancel" style={{ border: 'none', background: 'transparent', color: 'var(--cb-text-secondary)', cursor: 'pointer' }}>×</button>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {a.name}
                  <button
                    type="button"
                    onClick={() => { setEditingAccountId(a.id); setEditingName(a.name); setRenameError(''); }}
                    title="Rename account"
                    style={{ border: 'none', background: 'transparent', color: 'var(--cb-text-secondary)', cursor: 'pointer', fontSize: 11, padding: 0 }}
                  >
                    ✎
                  </button>
                </div>
              )}
              {a.isDefault && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cb-primary-800)', background: 'var(--cb-primary-50)', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}>DEFAULT</span>
              )}
            </div>
            {editingAccountId === a.id && renameError && (
              <div style={{ color: 'var(--cb-danger)', fontSize: 11, marginTop: 2 }}>{renameError}</div>
            )}
            <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 6 }}>
              {a.bank_name || '—'}{a.branch ? ` · ${a.branch}` : ''}{a.account_number ? ` · ${a.account_number}` : ''}
            </div>
            {(a.swift_code || a.mobile_money_wallet) && (
              <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)', marginBottom: 6 }}>
                {a.swift_code ? `SWIFT ${a.swift_code}` : ''}{a.swift_code && a.mobile_money_wallet ? ' · ' : ''}{a.mobile_money_wallet ? `MoMo ${a.mobile_money_wallet}` : ''}
              </div>
            )}
            <div style={{ fontSize: 20, fontWeight: 600 }}>{a.currency && a.currency !== 'GHS' ? `${a.currency} ` : ''}{currency(a.balance)}</div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setShowAddAccount((v) => !v)}
          style={{ border: '1px dashed var(--cb-border)', borderRadius: 'var(--cb-radius)', background: 'transparent', minWidth: 160, color: 'var(--cb-primary-800)', fontWeight: 600, fontSize: 13 }}
        >
          + Add bank account
        </button>
      </div>

      {showAddAccount && (
        <form onSubmit={handleAddAccount} style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 16, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, maxWidth: 820 }}>
          <label style={labelStyle}>Account name<input value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Bank<input value={newAccount.bankName} onChange={(e) => setNewAccount({ ...newAccount, bankName: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Branch<input value={newAccount.branch} onChange={(e) => setNewAccount({ ...newAccount, branch: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Account number<input value={newAccount.accountNumber} onChange={(e) => setNewAccount({ ...newAccount, accountNumber: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>
            Currency
            <select value={newAccount.currency} onChange={(e) => setNewAccount({ ...newAccount, currency: e.target.value })} style={inputStyle}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={labelStyle}>SWIFT code<input value={newAccount.swiftCode} onChange={(e) => setNewAccount({ ...newAccount, swiftCode: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>IBAN (optional)<input value={newAccount.iban} onChange={(e) => setNewAccount({ ...newAccount, iban: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Mobile money wallet (optional)<input value={newAccount.mobileMoneyWallet} onChange={(e) => setNewAccount({ ...newAccount, mobileMoneyWallet: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Opening balance<input type="number" min="0" step="0.01" value={newAccount.openingBalance} onChange={(e) => setNewAccount({ ...newAccount, openingBalance: e.target.value })} style={inputStyle} /></label>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, marginTop: 20 }}>
            <input type="checkbox" checked={newAccount.isDefault} onChange={(e) => setNewAccount({ ...newAccount, isDefault: e.target.checked })} />
            Set as default bank
          </label>
          <button type="submit" style={{ ...buttonStyle, alignSelf: 'end' }}>Create</button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
        <form onSubmit={handleTxnSubmit} style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Record banking transaction</div>

          <select value={txnType} onChange={(e) => setTxnType(e.target.value)} style={inputStyle}>
            {TXN_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>{TXN_TYPES.find((t) => t.key === txnType)?.hint} — happens automatically, you never pick accounts by debit/credit.</div>

          <label style={labelStyle}>
            {txnType === 'transfer' ? 'From account' : 'Bank account'}
            <select value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })} style={inputStyle} required>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          {txnType === 'transfer' && (
            <label style={labelStyle}>
              To account
              <select value={form.toBankAccountId} onChange={(e) => setForm({ ...form, toBankAccountId: e.target.value })} style={inputStyle} required>
                <option value="">Select…</option>
                {accounts.filter((a) => a.id !== form.bankAccountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}

          <label style={labelStyle}>Amount (GHS)<input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Reference<input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} style={inputStyle} /></label>

          {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}

          <button type="submit" disabled={saving || accounts.length === 0} style={buttonStyle}>{saving ? 'Saving…' : 'Record transaction'}</button>
        </form>

        <div style={{ background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Recent banking transactions</div>
          {transactions.length === 0 && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No banking transactions yet.</div>}
          {transactions.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--cb-border)', fontSize: 13 }}>
              <span>{t.description}</span>
              <span style={{ color: 'var(--cb-text-secondary)' }}>{t.entry_date}</span>
              <span style={{ fontWeight: 600 }}>{currency(t.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 14 };
const buttonStyle = { marginTop: 6, padding: '10px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 14 };
