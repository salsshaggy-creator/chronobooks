import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const POLL_MS = 60000;

const SEVERITY_COLOR = {
  danger: 'var(--cb-danger)',
  warning: 'var(--cb-amber-600)',
  info: 'var(--cb-primary-800)',
};

// A bell icon + dropdown, live-computed from whatever's already overdue/low/due rather
// than a stored feed -- see notification.service.js for what feeds it. Polls quietly in
// the background so the badge count stays current without the user having to refresh.
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const wrapperRef = useRef(null);

  function load() {
    api.listNotifications().then((r) => setNotifications(r.notifications)).catch(() => {});
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleDismiss(e, key) {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.key !== key));
    try {
      await api.dismissNotification(key);
    } catch {
      load(); // out of sync with the server -- resync rather than leave a stale list
    }
  }

  async function handleClearAll() {
    setLoading(true);
    try {
      await api.dismissAllNotifications();
      load();
    } finally {
      setLoading(false);
    }
  }

  function handleItemClick(n) {
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  const dismissableCount = notifications.filter((n) => n.dismissable).length;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={bellButtonStyle} title="Notifications">
        🔔
        {notifications.length > 0 && (
          <span style={badgeStyle}>{notifications.length > 9 ? '9+' : notifications.length}</span>
        )}
      </button>

      {open && (
        <div style={dropdownStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--cb-border)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            {dismissableCount > 0 && (
              <button type="button" onClick={handleClearAll} disabled={loading} style={clearAllStyle}>
                {loading ? 'Clearing…' : 'Clear all'}
              </button>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 && (
              <div style={{ padding: '18px 14px', fontSize: 12.5, color: 'var(--cb-text-secondary)', textAlign: 'center' }}>
                You're all caught up.
              </div>
            )}
            {notifications.map((n) => (
              <div
                key={n.key}
                onClick={() => handleItemClick(n)}
                style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--cb-border)', cursor: n.link ? 'pointer' : 'default' }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: SEVERITY_COLOR[n.severity] || SEVERITY_COLOR.info }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{n.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--cb-text-secondary)', marginTop: 2 }}>{n.message}</div>
                </div>
                {n.dismissable && (
                  <button type="button" onClick={(e) => handleDismiss(e, n.key)} style={dismissButtonStyle} title="Dismiss">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const bellButtonStyle = {
  position: 'relative', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--cb-border)', borderRadius: 8, background: 'var(--cb-surface)', fontSize: 16, cursor: 'pointer',
};
const badgeStyle = {
  position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, padding: '0 3px', borderRadius: 999,
  background: 'var(--cb-danger)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const dropdownStyle = {
  position: 'absolute', top: '110%', right: 0, width: 340, zIndex: 30,
  background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 10, boxShadow: '0 14px 32px -10px rgba(0,0,0,0.25)', overflow: 'hidden',
};
const clearAllStyle = { background: 'none', border: 'none', color: 'var(--cb-primary-800)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 };
const dismissButtonStyle = { alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--cb-text-secondary)', fontSize: 12, cursor: 'pointer', padding: '2px 4px' };
