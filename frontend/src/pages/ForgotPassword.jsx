import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await api.requestPasswordReset(email);
      setResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg)', padding: 24 }}>
      <div className="cb-fade-up" style={{ width: '100%', maxWidth: 420, background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 18, padding: '36px 38px', boxShadow: '0 30px 70px -30px rgba(28,26,51,0.35)' }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>🔑</div>
        <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Reset your password</div>
        <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginBottom: 22, lineHeight: 1.6 }}>
          Enter the email on your account and we'll send you a reset link.
        </div>

        {result ? (
          <div>
            <div style={{ fontSize: 13, marginBottom: 14 }}>
              If an account exists for <strong>{email}</strong>, a reset link has been generated.
            </div>
            {result.resetUrl ? (
              <div style={noticeStyle}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ No email service is configured on this install yet</div>
                <div style={{ marginBottom: 10 }}>So instead of waiting for an email, click below to reset it now:</div>
                <Link to={result.resetUrl} style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
                  Reset my password
                </Link>
              </div>
            ) : (
              <Link to="/login" style={{ color: 'var(--cb-primary-600)', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>Back to sign in</Link>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={labelStyle}>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} required />
            </label>
            {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}
            <button type="submit" disabled={loading} style={buttonStyle}>{loading ? 'Sending…' : 'Send reset link'}</button>
            <div style={{ fontSize: 12.5, textAlign: 'center' }}>
              <Link to="/login" style={{ color: 'var(--cb-primary-600)', fontWeight: 600, textDecoration: 'none' }}>Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, fontWeight: 600, color: 'var(--cb-text-primary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', border: '1px solid var(--cb-border)', borderRadius: 9, fontSize: 14, fontWeight: 400 };
const buttonStyle = { marginTop: 4, padding: '11px 14px', border: 'none', borderRadius: 9, background: 'linear-gradient(135deg, var(--cb-primary-600), var(--cb-primary-800))', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 10px 20px -10px var(--cb-primary-600)' };
const noticeStyle = { fontSize: 12.5, background: '#fdf6e8', border: '1px solid var(--cb-amber-400)', borderRadius: 10, padding: '14px 16px', color: 'var(--cb-text-primary)' };
