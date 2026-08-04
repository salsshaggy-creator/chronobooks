import { useState } from 'react';
import { api } from '../api/client';

const CURRENCIES = ['GHS', 'USD', 'NGN', 'GBP', 'EUR'];
const INDUSTRIES = ['Retail', 'Manufacturing', 'Mining', 'Agriculture', 'Construction', 'Hospitality', 'Professional Services', 'Technology', 'NGO / Non-profit', 'Other'];
const COMPANY_TYPES = ['Sole Proprietor', 'Partnership', 'Limited Liability Company', 'NGO'];

/**
 * First-run wizard shown once, right after email verification, while
 * company.setupCompleted is still false — write-up: "...asking you to create your
 * company and link you to it as an administrator." Finishing this seeds the chart of
 * accounts and Head Office branch and unlocks the rest of the app.
 */
export default function CompanySetup({ onComplete }) {
  const [companyName, setCompanyName] = useState('');
  const [currency, setCurrency] = useState('GHS');
  const [country, setCountry] = useState('Ghana');
  const [industry, setIndustry] = useState('');
  const [companyType, setCompanyType] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.completeSetup({ companyName, currency, country, industry, companyType });
      await onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg)', padding: 24 }}>
      <div className="cb-fade-up" style={{ width: '100%', maxWidth: 520, background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 18, padding: '38px 40px', boxShadow: '0 30px 70px -30px rgba(28,26,51,0.35)' }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>🏢</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Set up your company</div>
        <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
          You're verified — one more step. Tell us about your business and we'll build out
          your chart of accounts and get your books ready.
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={labelStyle}>
            Company name
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Solomon Trading Ltd" style={inputStyle} required />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              Base currency
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Country
              <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Ghana" style={inputStyle} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              Industry
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={inputStyle}>
                <option value="">Select…</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Company type
              <select value={companyType} onChange={(e) => setCompanyType(e.target.value)} style={inputStyle}>
                <option value="">Select…</option>
                {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Setting up…' : 'Finish setup & enter ChronoBooks'}
          </button>

          <div style={{ fontSize: 11.5, color: 'var(--cb-text-secondary)', textAlign: 'center' }}>
            You can change any of this later in Settings.
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, fontWeight: 600, color: 'var(--cb-text-primary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', border: '1px solid var(--cb-border)', borderRadius: 9, fontSize: 14, fontWeight: 400, background: '#fff' };
const buttonStyle = { marginTop: 4, padding: '11px 14px', border: 'none', borderRadius: 9, background: 'linear-gradient(135deg, var(--cb-primary-600), var(--cb-primary-800))', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 10px 20px -10px var(--cb-primary-600)' };
