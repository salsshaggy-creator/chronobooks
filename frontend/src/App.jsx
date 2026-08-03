import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Sales from './pages/Sales';
import Quotes from './pages/Quotes';
import Purchases from './pages/Purchases';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Banking from './pages/Banking';
import Payroll from './pages/Payroll';
import Accounting from './pages/Accounting';
import SystemAdmin from './pages/SystemAdmin';
import License from './pages/License';
import Approvals from './pages/Approvals';
import Inventory from './pages/Inventory';
import FixedAssets from './pages/FixedAssets';
import Budgets from './pages/Budgets';
import Reconciliation from './pages/Reconciliation';
import Recurring from './pages/Recurring';
import AiAvatar from './components/AiAvatar';
import NotificationBell from './components/NotificationBell';
import { api, loadAccessToken, setAccessToken } from './api/client';
import { applyBrandPreset } from './theme/presets';

export default function App() {
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [checked, setChecked] = useState(false);

  function loadCompanyContext(company) {
    if (company) applyBrandPreset(company.brandAccentColor);
    api.listMyCompanies().then((r) => setCompanies(r.companies)).catch(() => {});
  }

  useEffect(() => {
    const token = loadAccessToken();
    if (!token) {
      setChecked(true);
      return;
    }
    api.me().then((r) => {
      setUser(r.user);
      return api.getCompany();
    }).then(loadCompanyContext)
      .catch(() => setAccessToken(null))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return null;

  async function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    const company = await api.getCompany();
    loadCompanyContext(company);
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // even if the request fails (e.g. token already expired), still clear locally
    }
    setAccessToken(null);
    setUser(null);
    setCompanies([]);
  }

  async function handleSwitchCompany(companyId) {
    try {
      const { accessToken, user: switchedUser } = await api.switchCompany(companyId);
      setAccessToken(accessToken);
      setUser(switchedUser);
      const company = await api.getCompany();
      loadCompanyContext(company);
    } catch (err) {
      // if the switch fails, just leave the user where they were
      console.error(err);
    }
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={handleLogin} />} />
      </Routes>
    );
  }

  const isAdmin = user.role === 'administrator' || user.role === 'super_administrator';
  const isSuperAdmin = user.role === 'super_administrator';

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar
        companyName={user.companyName}
        userName={user.fullName}
        isSuperAdmin={isSuperAdmin}
        companies={companies}
        onSignOut={handleLogout}
        onSwitchCompany={handleSwitchCompany}
      />
      {/* Keying on companyId forces every page below to remount (and refetch) after a company switch. */}
      <div style={{ flex: 1 }} key={user.companyId}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px 0' }}>
          <NotificationBell />
        </div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/banking" element={<Banking />} />
          <Route path="/reconciliation" element={<Reconciliation />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/fixed-assets" element={<FixedAssets />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/accounting" element={<Accounting canPost={user.role === 'administrator' || user.role === 'accountant' || isSuperAdmin} />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/settings" element={<Settings isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} />} />
          <Route path="/license" element={<License isSuperAdmin={isSuperAdmin} />} />
          {isSuperAdmin && <Route path="/system-admin" element={<SystemAdmin onSwitchCompany={handleSwitchCompany} />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <AiAvatar isAdmin={isAdmin} />
    </div>
  );
}
