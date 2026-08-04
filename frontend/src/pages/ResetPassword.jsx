import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import PasswordField from '../components/PasswordField';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg)', padding: 24 }}>
      <div className="cb-fade-up" style={{ width: '100%', maxWidth: 420, background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 18, padding: '36px 38px', boxShadow: '0 30px 70px -30px rgba(28,26,51,0.35)' }}>
        {done ? (
          <>
            <div style={{ fontSize: 26, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>Password updated</div>
            <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginBottom: 18 }}>You can sign in with your new password now.</div>
            <Link to="/login" style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>Go to sign in</Link>
          </>
        ) : (
          <>
            <div style={{ fontSize: 26, marginBottom: 8 }}>🔑</div>
            <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Choose a new password</div>
            <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginBottom: 22 }}>Make it something you haven't used before.</div>

            {!token && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 14 }}>This link is missing its token — request a new one from the forgot-password page.</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={labelStyle}>
                New password
                <PasswordField value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} autoComplete="new-password" />
              </label>
              <label style={labelStyle}>
                Confirm new password
                <PasswordField value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Type it again" style={inputStyle} autoComplete="new-password" />
              </label>
              {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13 }}>{error}</div>}
              <button type="submit" disabled={loading || !token} style={buttonStyle}>{loading ? 'Updating…' : 'Update password'}</button>
              <div style={{ fontSize: 12.5, textAlign: 'center' }}>
                <Link to="/login" style={{ color: 'var(--cb-primary-600)', fontWeight: 600, textDecoration: 'none' }}>Back to sign in</Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, fontWeight: 600, color: 'var(--cb-text-primary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', border: '1px solid var(--cb-border)', borderRadius: 9, fontSize: 14, fontWeight: 400 };
const buttonStyle = { marginTop: 4, padding: '11px 14px', border: 'none', borderRadius: 9, background: 'linear-gradient(135deg, var(--cb-primary-600), var(--cb-primary-800))', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 10px 20px -10px var(--cb-primary-600)' };
