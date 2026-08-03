import { useState } from 'react';
import { NavLink } from 'react-router-dom';

// Grouped the same way ChronoSync groups its own sidebar (small uppercase section
// headers over related items) instead of one long flat list — related modules now read
// together instead of being ordered purely by when each one was built.
const NAV_GROUPS = [
  {
    header: 'DASHBOARD',
    items: [{ to: '/', label: 'Dashboard', icon: '▣' }],
  },
  {
    header: 'SALES & PURCHASES',
    items: [
      { to: '/quotes', label: 'Quotes', icon: '✎' },
      { to: '/sales', label: 'Sales', icon: '⇆' },
      { to: '/purchases', label: 'Purchases', icon: '⇇' },
      { to: '/expenses', label: 'Expenses', icon: '⤸' },
      { to: '/recurring', label: 'Recurring', icon: '↻' },
    ],
  },
  {
    header: 'BANKING',
    items: [
      { to: '/banking', label: 'Banking', icon: '⛱' },
      { to: '/reconciliation', label: 'Reconciliation', icon: '⚖' },
    ],
  },
  {
    header: 'OPERATIONS',
    items: [
      { to: '/inventory', label: 'Inventory', icon: '▧' },
      { to: '/fixed-assets', label: 'Fixed Assets', icon: '🏢' },
      { to: '/payroll', label: 'Payroll', icon: '☺' },
    ],
  },
  {
    header: 'ACCOUNTING & REPORTS',
    items: [
      { to: '/accounting', label: 'Accounting', icon: '≡' },
      { to: '/reports', label: 'Reports', icon: '▤' },
      { to: '/budgets', label: 'Budgets', icon: '🎯' },
    ],
  },
  {
    header: 'ADMIN',
    items: [
      { to: '/approvals', label: 'Approvals', icon: '✓' },
      { to: '/license', label: 'License', icon: '🔑' },
      { to: '/settings', label: 'Settings', icon: '⚙' },
    ],
  },
];

export default function Sidebar({ companyName, userName, isSuperAdmin, companies, onSignOut, onSwitchCompany }) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const canSwitch = companies && companies.length > 1;

  // Inject System Admin into the Admin group for super-admins, rather than tacking it
  // onto the end of a flat list.
  const groups = isSuperAdmin
    ? NAV_GROUPS.map((g) =>
        g.header === 'ADMIN' ? { ...g, items: [...g.items, { to: '/system-admin', label: 'System Admin', icon: '🛡' }] } : g
      )
    : NAV_GROUPS;

  return (
    <aside
      style={{
        width: 220,
        background: 'var(--cb-primary-900)',
        color: 'var(--cb-primary-50)',
        height: '100vh',
        padding: '20px 14px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ padding: '0 10px 14px' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>ChronoBooks</div>
      </div>

      <div style={{ padding: '0 10px 16px', position: 'relative' }}>
        <button
          type="button"
          onClick={() => canSwitch && setSwitcherOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
            padding: '8px 10px', color: '#fff', cursor: canSwitch ? 'pointer' : 'default',
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {companyName || 'Demo SME Ltd'}
          </span>
          {canSwitch && <span style={{ fontSize: 10, opacity: 0.8 }}>▾</span>}
        </button>

        {switcherOpen && canSwitch && (
          <div
            style={{
              position: 'absolute', top: '100%', left: 10, right: 10, marginTop: 4, zIndex: 20,
              background: '#fff', borderRadius: 8, boxShadow: '0 10px 24px -8px rgba(0,0,0,0.4)', overflow: 'hidden',
            }}
          >
            {companies.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setSwitcherOpen(false); onSwitchCompany(c.id); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none',
                  background: c.name === companyName ? 'var(--cb-primary-50)' : '#fff', color: 'var(--cb-text-primary)', fontSize: 13,
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {groups.map((group, idx) => (
          <div key={group.header} style={{ marginTop: idx === 0 ? 0 : 14 }}>
            <div
              style={{
                padding: '0 10px 6px',
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.38)',
              }}
            >
              {group.header}
            </div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 8,
                  fontSize: 14,
                  textDecoration: 'none',
                  color: isActive ? '#fff' : 'var(--cb-primary-100)',
                  background: isActive ? 'var(--cb-primary-600)' : 'transparent',
                })}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10 }}>
        <div style={{ padding: '0 10px 8px', fontSize: 12, color: 'var(--cb-primary-200)' }}>
          Signed in as {userName || 'Demo Admin'}
        </div>
        <button
          onClick={onSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '9px 12px',
            borderRadius: 8,
            fontSize: 14,
            border: 'none',
            background: 'transparent',
            color: 'var(--cb-primary-100)',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span aria-hidden="true">⏻</span>
          Sign out
        </button>
      </div>
    </aside>
  );
}
