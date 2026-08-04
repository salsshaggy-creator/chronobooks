import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api, setAccessToken } from '../api/client';

/**
 * Landing point for the (stubbed) verification link — write-up: "clicking that sends you
 * straight to the software on a setup page." Verifies the token, logs the person straight
 * in (verifyEmail issues the same tokens login() would), then hands off to App.jsx via
 * onVerified so it can route to the company-setup wizard.
 */
export default function VerifyEmail({ onVerified }) {
  const [params] = useSearchParams();
  const [status, setStatus] = useState('verifying'); // verifying | error
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get('token');
    if (!token) {
      setStatus('error');
      setError('This verification link is missing its token.');
      return;
    }
    api.verifyEmail(token)
      .then((r) => {
        setAccessToken(r.accessToken);
        onVerified(r.user);
        navigate(r.needsSetup ? '/setup' : '/', { replace: true });
      })
      .catch((err) => {
        setStatus('error');
        setError(err.message);
      });
  }, [params, navigate, onVerified]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cb-bg)', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 16, padding: '36px 32px' }}>
        {status === 'verifying' ? (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📒</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Verifying your email…</div>
            <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>One moment.</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Couldn't verify that link</div>
            <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginBottom: 18 }}>{error}</div>
            <Link to="/signup" style={{ color: 'var(--cb-primary-600)', fontWeight: 600, textDecoration: 'none' }}>Back to sign up</Link>
          </>
        )}
      </div>
    </div>
  );
}
