import { useEffect, useState } from 'react';
import { api } from '../api/client';

const emptyForm = {
  companyName: '', currency: 'GHS', country: '', industry: '', companyType: '',
  adminFirstName: '', adminLastName: '', adminEmail: '', adminPassword: '',
};

/**
 * System Administration — Super Administrator only (write-up: "creates companies,
 * creates administrators, assigns licenses, enables/disables modules, views
 * system-wide audit logs"). This page covers the "creates companies" half; each new
 * company gets its own default chart of accounts and Head Office branch immediately,
 * plus its first Company Administrator, who then manages that company's own users.
 */
export default function SystemAdmin({ onSwitchCompany }) {
  const [companies, setCompanies] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    api.listSystemCompanies().then((r) => setCompanies(r.companies)).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const created = await api.createSystemCompany(form);
      setForm(emptyForm);
      setShowAdd(false);
      load();
      if (onSwitchCompany) onSwitchCompany(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>System Administration</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 16 }}>
        Every company on the platform. Only visible to the Super Administrator.
      </p>

      <div style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => setShowAdd((v) => !v)} style={buttonStyle}>+ Create company</button>
      </div>

      {showAdd && (
        <form onSubmit={handleCreate} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 820, marginBottom: 20 }}>
          <div style={{ gridColumn: 'span 3', fontSize: 13, fontWeight: 600 }}>Company</div>
          <label style={labelStyle}>Company name<input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Currency<input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Country<input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Industry<input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Company type<input value={form.companyType} onChange={(e) => setForm({ ...form, companyType: e.target.value })} style={inputStyle} /></label>

          <div style={{ gridColumn: 'span 3', fontSize: 13, fontWeight: 600, marginTop: 8 }}>First Company Administrator</div>
          <label style={labelStyle}>First name<input value={form.adminFirstName} onChange={(e) => setForm({ ...form, adminFirstName: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Last name<input value={form.adminLastName} onChange={(e) => setForm({ ...form, adminLastName: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Email<input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Password<input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} style={inputStyle} required /></label>

          {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, gridColumn: 'span 3' }}>{error}</div>}
          <button type="submit" disabled={saving} style={{ ...buttonStyle, gridColumn: 'span 1', justifySelf: 'start' }}>{saving ? 'Creating…' : 'Create company'}</button>
        </form>
      )}

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Company</th><th style={thStyle}>Industry</th><th style={thStyle}>Type</th><th style={thStyle}>Currency</th><th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                <td style={tdStyle}>{c.name}</td>
                <td style={tdStyle}>{c.industry || '—'}</td>
                <td style={tdStyle}>{c.company_type || '—'}</td>
                <td style={tdStyle}>{c.currency}</td>
                <td style={tdStyle}>
                  <button type="button" onClick={() => onSwitchCompany && onSwitchCompany(c.id)} style={linkButtonStyle}>Switch into →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 14 };
const buttonStyle = { padding: '9px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 13 };
const linkButtonStyle = { border: 'none', background: 'transparent', color: 'var(--cb-primary-600)', fontSize: 12, fontWeight: 600 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px' };
const cardStyle = { background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 };
