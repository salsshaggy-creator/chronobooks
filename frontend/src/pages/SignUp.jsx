import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import BookStack from '../components/BookStack';
import PasswordField from '../components/PasswordField';

const TRUST_POINTS = [
  { icon: '🎁', label: '30-day free trial, no card required' },
  { icon: '⚡', label: "You're the Administrator from day one" },
  { icon: '⚖️', label: 'Double-entry, always balanced' },
];

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const r = await api.register(email, password);
      setResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--cb-bg)',
        padding: 24,
      }}
    >
      <div
        className="cb-fade-up"
        style={{
          display: 'flex',
          width: '100%',
          maxWidth: 920,
          minHeight: 560,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 30px 70px -30px rgba(28,26,51,0.35)',
        }}
      >
        <div
          style={{
            flex: '0 0 46%',
            background: 'linear-gradient(160deg, var(--cb-primary-900), var(--cb-primary-600) 75%, var(--cb-primary-400))',
            color: '#fff',
            padding: '36px 34px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>📒</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>ChronoBooks</div>
                <div style={{ fontSize: 10.5, opacity: 0.75, letterSpacing: 0.4 }}>ACCOUNTING</div>
              </div>
            </div>
            <div style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 }}>Start your free trial.</div>
            <div style={{ fontSize: 13.5, opacity: 0.85, lineHeight: 1.6 }}>
              Create your account, verify your email, tell us about your company, and you're
              in — bookkeeping, invoicing, and reports, ready in minutes.
            </div>
          </div>
          <BookStack />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {TRUST_POINTS.map((t) => (
              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, opacity: 0.9 }}>
                <span>{t.icon}</span>{t.label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, background: 'var(--cb-surface)', padding: '44px 46px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {result ? (
            <div>
              <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>Check your inbox 📬</div>
              <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                We've sent a verification link to <strong>{result.email}</strong>. Click it to
                verify your account and jump straight into setting up your company.
              </div>
              <div style={{ ...noticeStyle }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ No email service is configured on this install yet</div>
                <div style={{ marginBottom: 10 }}>So instead of waiting for an email, just click below to verify right now:</div>
                <Link to={result.verificationUrl} style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
                  Verify my email &amp; continue
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>Create your account</div>
              <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginBottom: 26 }}>
                Free for 30 days. You'll be the Administrator — up to 2 users on the trial.
                Just your email and a password to get started; you'll add your name and
                company details right after.
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label style={labelStyle}>
                  Email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} required />
                </label>
                <label style={labelStyle}>
                  Password
                  <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} autoComplete="new-password" />
                </label>
                <label style={labelStyle}>
                  Confirm password
                  <PasswordField value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Type it again" style={inputStyle} autoComplete="new-password" />
                </label>

                {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}

                <button type="submit" disabled={loading} style={buttonStyle}>
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <div style={{ fontSize: 12.5, textAlign: 'center', marginTop: 18 }}>
                Already have an account? <Link to="/login" style={{ color: 'var(--cb-primary-600)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
              </div>

              <div style={{ fontSize: 11.5, textAlign: 'center', marginTop: 10 }}>
                <Link to="/faq" style={{ color: 'var(--cb-text-secondary)', textDecoration: 'underline' }}>Questions about the trial or pricing? See the FAQ</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, fontWeight: 600, color: 'var(--cb-text-primary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', border: '1px solid var(--cb-border)', borderRadius: 9, fontSize: 14, fontWeight: 400 };
const buttonStyle = { marginTop: 4, padding: '11px 14px', border: 'none', borderRadius: 9, background: 'linear-gradient(135deg, var(--cb-primary-600), var(--cb-primary-800))', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 10px 20px -10px var(--cb-primary-600)' };
const noticeStyle = { fontSize: 12.5, background: '#fdf6e8', border: '1px solid var(--cb-amber-400)', borderRadius: 10, padding: '14px 16px', color: 'var(--cb-text-primary)' };
