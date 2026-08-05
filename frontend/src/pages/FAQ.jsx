import { Link } from 'react-router-dom';
import FAQList from '../components/FAQList';

// Public FAQ page -- reachable without signing in, linked from Login and SignUp, so
// visitors can get answers about the trial, pricing, and the product before they
// create an account.
export default function FAQ() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cb-bg)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--cb-primary-900)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>📒</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1, color: 'var(--cb-text-primary)' }}>ChronoBooks</div>
              <div style={{ fontSize: 10.5, opacity: 0.6, letterSpacing: 0.4, color: 'var(--cb-text-secondary)' }}>ACCOUNTING</div>
            </div>
          </div>
          <Link to="/" style={{ fontSize: 13, fontWeight: 600, color: 'var(--cb-primary-600)', textDecoration: 'none' }}>← Back to sign in</Link>
        </div>

        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--cb-text-primary)', marginBottom: 6 }}>
          Frequently asked questions
        </div>
        <div style={{ fontSize: 14, color: 'var(--cb-text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
          Everything about the free trial, plans and modules, and how your data is kept
          secure. Can't find what you're looking for? The AI assistant inside ChronoBooks
          can help once you're signed in.
        </div>

        <FAQList />

        <div style={{ marginTop: 40, textAlign: 'center', fontSize: 12.5 }}>
          Don't have an account yet? <Link to="/signup" style={{ color: 'var(--cb-primary-600)', fontWeight: 600, textDecoration: 'none' }}>Start your free trial</Link>
        </div>
      </div>
    </div>
  );
}
