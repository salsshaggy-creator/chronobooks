import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import MetricCard from '../components/MetricCard';
import TrendChart from '../components/TrendChart';

const currency = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const SOURCE_LABEL = {
  expense: 'Expense', invoice: 'Invoice', receipt: 'Receipt', bill: 'Bill',
  supplier_payment: 'Supplier payment', bank_deposit: 'Deposit', bank_withdraw: 'Withdrawal',
  bank_transfer: 'Transfer', bank_charge: 'Bank charge', bank_interest: 'Interest',
  payroll: 'Payroll', manual: 'Journal entry', opening_balance: 'Opening balance',
};

const QUICK_ACTIONS = [
  { to: '/expenses', label: 'Record expense', icon: '\u{1F4B8}' },
  { to: '/sales', label: 'Raise invoice', icon: '\u{1F9FE}' },
  { to: '/purchases', label: 'Record bill', icon: '\u{1F4E5}' },
  { to: '/banking', label: 'Bank transaction', icon: '\u{1F3E6}' },
  { to: '/payroll', label: 'Import payroll', icon: '\u{1F465}' },
  { to: '/accounting', label: 'Journal entry', icon: '\u{1F4D2}' },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.dashboardSummary().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <div style={{ padding: 24, color: 'var(--cb-danger)' }}>{error}</div>;
  if (!data) return <div style={{ padding: 24, color: 'var(--cb-text-secondary)' }}>Loading…</div>;

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const net = data.profitLoss;

  return (
    <div className="cb-marble-page" style={{ padding: 24 }}>
      {/* Drifting marble color blooms sit behind every glass surface on this page */}
      <div className="cb-marble-backdrop">
        <div className="cb-marble-blob" style={{ width: 420, height: 420, top: -120, left: -60, background: 'var(--cb-primary-400)', animation: 'cb-marble-drift 22s ease-in-out infinite' }} />
        <div className="cb-marble-blob" style={{ width: 360, height: 360, top: 140, right: -80, background: 'var(--cb-amber-400)', opacity: 0.32, animation: 'cb-marble-drift-slow 26s ease-in-out infinite' }} />
        <div className="cb-marble-blob" style={{ width: 320, height: 320, top: 480, left: '30%', background: 'var(--cb-primary-200)', opacity: 0.4, animation: 'cb-marble-drift 30s ease-in-out infinite reverse' }} />
        <div className="cb-marble-blob" style={{ width: 260, height: 260, top: 780, right: '10%', background: 'var(--cb-primary-600)', opacity: 0.22, animation: 'cb-marble-drift-slow 20s ease-in-out infinite' }} />
      </div>

      {/* Hero */}
      <div
        className="cb-fade-up cb-glass-dark"
        style={{
          borderRadius: 20,
          padding: '26px 28px',
          color: '#fff',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 20,
          overflow: 'hidden',
        }}
      >
        <div className="cb-glass-veins" />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 3 }}>{greeting()} 👋</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>{today} · The books, balanced live.</div>
        </div>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255,255,255,0.16)',
            border: '1px solid rgba(255,255,255,0.28)',
            borderRadius: 999,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'var(--cb-success)',
              animation: 'cb-pulse-dot 2s infinite',
            }}
          />
          Books balanced ✓
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <MetricCard label="Bank balance" value={currency(data.bankBalance)} icon="🏦" chipBg="var(--cb-primary-50)" delay={0} />
        <MetricCard label="Cash on hand" value={currency(data.cashOnHand)} icon="💵" chipBg="var(--cb-primary-50)" delay={40} />
        <MetricCard label="Income this month" value={currency(data.monthlyIncome)} icon="📈" tone="success" chipBg="#e1f5ee" delay={80} />
        <MetricCard label="Expenses this month" value={currency(data.monthlyExpenses)} icon="📉" tone="danger" chipBg="#faece7" delay={120} />
        <MetricCard label="Profit / loss (MTD)" value={currency(net)} icon={net >= 0 ? '✅' : '⚠️'} tone={net >= 0 ? 'success' : 'danger'} chipBg={net >= 0 ? '#e1f5ee' : '#faece7'} delay={160} />
        <MetricCard label="Owed by customers" value={currency(data.outstandingCustomers)} icon="🧾" delay={200} />
        <MetricCard label="Owed to suppliers" value={currency(data.outstandingSuppliers)} icon="📦" delay={240} />
        <MetricCard label="Taxes due" value={currency(0)} icon="🏛️" delay={280} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Cash flow chart */}
        <div
          className="cb-fade-up cb-glass"
          style={{
            animationDelay: '260ms',
            borderRadius: 16,
            padding: 18,
            overflow: 'hidden',
          }}
        >
          <div className="cb-glass-veins" />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Cash flow trend</div>
            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--cb-text-secondary)' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--cb-success)', marginRight: 5 }} />Income</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--cb-amber-400)', marginRight: 5 }} />Expenses</span>
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <TrendChart data={data.monthlyTrend} />
          </div>
        </div>

        {/* Quick actions */}
        <div
          className="cb-fade-up cb-glass"
          style={{
            animationDelay: '300ms',
            borderRadius: 16,
            padding: 18,
            overflow: 'hidden',
          }}
        >
          <div className="cb-glass-veins" />
          <div style={{ position: 'relative', zIndex: 1, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Quick actions</div>
          <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.to}
                onClick={() => navigate(a.to)}
                className="cb-hover-lift"
                style={{
                  border: '1px solid rgba(255,255,255,0.6)',
                  background: 'rgba(255,255,255,0.55)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  borderRadius: 10,
                  padding: '12px 8px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--cb-text-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 18 }}>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div
        className="cb-fade-up cb-glass"
        style={{
          animationDelay: '340ms',
          borderRadius: 16,
          padding: 18,
          overflow: 'hidden',
        }}
      >
        <div className="cb-glass-veins" />
        <div style={{ position: 'relative', zIndex: 1, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Recent activity</div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          {data.recentTransactions.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>No transactions yet.</div>
          )}
          {data.recentTransactions.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderTop: '1px solid rgba(99, 95, 128, 0.16)',
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--cb-primary-800)',
                    background: 'var(--cb-primary-50)',
                    borderRadius: 999,
                    padding: '3px 9px',
                  }}
                >
                  {SOURCE_LABEL[t.source_type] || t.source_type}
                </span>
                <span>{t.description}</span>
              </div>
              <span style={{ color: 'var(--cb-text-secondary)' }}>{t.entry_date}</span>
              <span style={{ fontWeight: 600 }}>{currency(t.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
