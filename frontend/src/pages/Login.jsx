import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setAccessToken } from '../api/client';
import BookStack from '../components/BookStack';
import PasswordField from '../components/PasswordField';

const TRUST_POINTS = [
  { icon: '🛡️', label: 'Bank-grade login security' },
  { icon: '🏢', label: 'Multi-company support' },
  { icon: '⚖️', label: 'Double-entry, always balanced' },
];

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { accessToken, user } = await api.login(email, password);
      setAccessToken(accessToken);
      onLogin(user);
      navigate('/');
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
        {/* Left: brand panel */}
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
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: 'rgba(255,255,255,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 17,
                }}
              >
                📒
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>ChronoBooks</div>
                <div style={{ fontSize: 10.5, opacity: 0.75, letterSpacing: 0.4 }}>ACCOUNTING</div>
              </div>
            </div>

            <div style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 }}>
              Books that balance themselves.
            </div>
            <div style={{ fontSize: 13.5, opacity: 0.85, lineHeight: 1.6 }}>
              Record income and expenses in plain language — ChronoBooks handles the
              debits and credits behind the scenes. Built for Ghanaian businesses.
            </div>
          </div>

          <BookStack />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {TRUST_POINTS.map((t) => (
              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, opacity: 0.9 }}>
                <span>{t.icon}</span>
                {t.label}
              </div>
            ))}
          </div>
        </div>

        {/* Right: form */}
        <div
          style={{
            flex: 1,
            background: 'var(--cb-surface)',
            padding: '44px 46px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>Welcome back</div>
          <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginBottom: 26 }}>
            Sign in to your ChronoBooks account
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--cb-text-primary)' }}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                style={inputStyle}
                required
              />
            </label>

            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--cb-text-primary)' }}>
              Password
              <PasswordField
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                style={inputStyle}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--cb-text-secondary)' }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember me
              </label>
              <Link to="/forgot-password" style={{ color: 'var(--cb-primary-600)', fontWeight: 600, textDecoration: 'none' }}>Forgot password?</Link>
            </div>

            {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}

            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div style={{ fontSize: 12.5, textAlign: 'center', marginTop: 18 }}>
            Don't have an account? <Link to="/signup" style={{ color: 'var(--cb-primary-600)', fontWeight: 600, textDecoration: 'none' }}>Sign up</Link>
          </div>

          <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)', textAlign: 'center', marginTop: 16 }}>
            Protected by ChronoBooks security · © 2026 ChronoBooks Accounting · <Link to="/faq" style={{ color: 'var(--cb-text-secondary)', textDecoration: 'underline' }}>FAQ</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: '10px 12px',
  border: '1px solid var(--cb-border)',
  borderRadius: 9,
  fontSize: 14,
  fontWeight: 400,
};

const buttonStyle = {
  marginTop: 4,
  padding: '11px 14px',
  border: 'none',
  borderRadius: 9,
  background: 'linear-gradient(135deg, var(--cb-primary-600), var(--cb-primary-800))',
  color: '#fff',
  fontWeight: 600,
  fontSize: 14,
  boxShadow: '0 10px 20px -10px var(--cb-primary-600)',
};
