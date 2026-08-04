import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import CompanySetup from './pages/CompanySetup';
import UpgradeGate from './pages/UpgradeGate';
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
  const [company, setCompany] = useState(null);
  const [license, setLicense] = useState(null);
  const [checked, setChecked] = useState(false);

  function loadCompanyContext(companyRecord) {
    setCompany(companyRecord);
    if (companyRecord) applyBrandPreset(companyRecord.brandAccentColor);
    api.listMyCompanies().then((r) => setCompanies(r.companies)).catch(() => {});
    // A brand-new self-serve company's license status is meaningless until setup is
    // finished (it has no chart of accounts yet), so skip the fetch until then --
    // otherwise this call can race completeSetup and briefly show the Upgrade gate.
    if (companyRecord && companyRecord.setupCompleted) {
      api.getLicense().then(setLicense).catch(() => setLicense(null));
    } else {
      setLicense(null);
    }
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
    setCompany(null);
    setLicense(null);
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
        <Route path="/signup" element={<SignUp />} />
        <Route path="/verify" element={<VerifyEmail onVerified={handleLogin} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Login onLogin={handleLogin} />} />
      </Routes>
    );
  }

  const isAdmin = user.role === 'administrator' || user.role === 'super_administrator';
  const isSuperAdmin = user.role === 'super_administrator';

  // First-run wizard (write-up: "...asking you to create your company and link you to
  // it as an administrator") -- blocks the rest of the app until finished.
  if (company && !company.setupCompleted) {
    return (
      <CompanySetup
        onComplete={async () => {
          const c = await api.getCompany();
          loadCompanyContext(c);
        }}
      />
    );
  }

  // Trial fully expired (past its 30-day grace period) -- blocks everything except
  // signing out, mirroring middleware/auth.js's backend enforcement. Super Admins manage
  // every company's license, so their own is never the blocker.
  if (!isSuperAdmin && license && license.status === 'expired') {
    return <UpgradeGate license={license} onSignOut={handleLogout} />;
  }

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
        {!isSuperAdmin && license && license.status === 'grace_period' && (
          <div style={{ background: 'linear-gradient(120deg, #993c1d, #d85a30)', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ Your trial ended {Math.abs(license.daysLeft)} day{Math.abs(license.daysLeft) === 1 ? '' : 's'} ago — you're in a 30-day grace period. Upgrade to keep uninterrupted access.</span>
            <Link to="/license" style={{ color: '#fff', textDecoration: 'underline', fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 12 }}>View plans</Link>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px 0' }}>
          <NotificationBell />
        </div>
        <Routes>
          <Route path="/verify" element={<VerifyEmail onVerified={handleLogin} />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
