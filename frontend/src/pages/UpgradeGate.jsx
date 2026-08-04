import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { MODULES } from './License';

/**
 * Full-screen, blocking plan picker shown in place of the whole app once a company's
 * license status comes back 'expired' (past its 30-day grace period) — write-up: "...ask
 * them to upgrade or activate their account after it has expired, giving them options."
 * No payment processor is wired up, so "Request this plan" just records the request for
 * a Super Administrator to review and activate (see License.jsx's Pending Requests panel)
 * rather than charging anything automatically.
 */
export default function UpgradeGate({ license, onSignOut }) {
  const [tiers, setTiers] = useState([]);
  const [requesting, setRequesting] = useState(null);
  const [requested, setRequested] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listPricingTiers().then((r) => setTiers(r.tiers)).catch(() => {});
  }, []);

  async function handleRequest(tier) {
    setRequesting(tier.id);
    setError('');
    try {
      await api.requestUpgrade(tier.id);
      setRequested(tier.plan_name);
    } catch (err) {
      setError(err.message);
    } finally {
      setRequesting(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cb-bg)', padding: '40px 24px', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Your free trial has ended</div>
          <div style={{ fontSize: 14, color: 'var(--cb-text-secondary)', maxWidth: 540, margin: '0 auto' }}>
            {license?.planName ? `You were on ${license.planName}. ` : ''}
            Choose a plan to keep using ChronoBooks — pick what fits, request it below, and
            your Super Administrator will activate it shortly.
          </div>
        </div>

        {requested && (
          <div style={{ maxWidth: 560, margin: '0 auto 24px', background: '#e1f5ee', border: '1px solid var(--cb-success)', borderRadius: 12, padding: '14px 18px', textAlign: 'center', fontSize: 13.5, color: '#0f6e56', fontWeight: 600 }}>
            ✓ Request sent for {requested}. We'll activate your account shortly — check back soon.
          </div>
        )}
        {error && <div style={{ textAlign: 'center', color: 'var(--cb-danger)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
          {tiers.map((t) => {
            const modules = t.modulesIncluded || [];
            const isPopular = t.plan_name === 'Business';
            return (
              <div
                key={t.id}
                style={{
                  background: 'var(--cb-surface)',
                  border: isPopular ? '2px solid var(--cb-primary-500)' : '1px solid var(--cb-border)',
                  borderRadius: 14, padding: '20px 18px', display: 'flex', flexDirection: 'column', position: 'relative',
                }}
              >
                {isPopular && (
                  <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: 'var(--cb-primary-600)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cb-text-secondary)', marginBottom: 6 }}>{t.plan_name}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>{t.annual_fee}</div>
                <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)', marginBottom: 14 }}>{t.annual_fee === 'Custom Quote' ? ' ' : '/year'}</div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>👥 {t.users_included} users</div>
                <div style={{ fontSize: 12, marginBottom: 12 }}>🏢 {t.companies_included} {t.companies_included === '1' ? 'company' : 'companies'}</div>
                <div style={{ borderTop: '1px solid var(--cb-border)', paddingTop: 10, marginBottom: 14, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cb-text-secondary)', marginBottom: 6 }}>INCLUDES</div>
                  <div style={{ fontSize: 11.5, marginBottom: 4 }}>✓ Core Accounting</div>
                  {modules.length === 0 && <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>No extra modules</div>}
                  {modules.map((m) => {
                    const meta = MODULES.find((x) => x.key === m);
                    return meta ? <div key={m} style={{ fontSize: 11.5, marginBottom: 4 }}>✓ {meta.label}</div> : null;
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => handleRequest(t)}
                  disabled={requesting === t.id}
                  style={{
                    padding: '9px 12px', borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
                    background: isPopular ? 'linear-gradient(135deg, var(--cb-primary-600), var(--cb-primary-800))' : 'var(--cb-bg)',
                    color: isPopular ? '#fff' : 'var(--cb-text-primary)',
                    border: isPopular ? 'none' : '1px solid var(--cb-border)',
                  }}
                >
                  {requesting === t.id ? 'Requesting…' : requested === t.plan_name ? 'Requested ✓' : 'Request this plan'}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: 30 }}>
          <button type="button" onClick={onSignOut} style={{ border: 'none', background: 'transparent', color: 'var(--cb-text-secondary)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
