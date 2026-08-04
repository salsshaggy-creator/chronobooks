import { useEffect, useState } from 'react';
import { api } from '../api/client';

export const MODULES = [
  { key: 'inventoryEnabled', label: 'Inventory', description: 'Stock tracking, receipts, and issues.', icon: '📦' },
  { key: 'fixedAssetsEnabled', label: 'Fixed Assets', description: 'Asset registration and depreciation.', icon: '🏷️' },
  { key: 'budgetingEnabled', label: 'Budgeting', description: 'Budgets vs actuals.', icon: '🎯' },
  { key: 'procurementEnabled', label: 'Procurement', description: 'Purchase orders and requisitions.', icon: '🛒' },
  { key: 'manufacturingEnabled', label: 'Manufacturing', description: 'Bills of materials and production runs.', icon: '🏭' },
  { key: 'posEnabled', label: 'Point of Sale', description: 'Till-based retail sales.', icon: '🧾' },
  { key: 'multiCurrencyEnabled', label: 'Multi-Currency', description: 'Transact and report in more than one currency.', icon: '💱' },
  { key: 'consolidationEnabled', label: 'Consolidation', description: 'Combined reporting across companies.', icon: '📊' },
];

const REMINDERS = [
  ['60 days before expiry', 'Early renewal notice'],
  ['30 days before expiry', 'Standard renewal notice'],
  ['14 days before expiry', 'Urgent renewal notice'],
  ['7 days before expiry', 'Final renewal warning'],
  ['Daily during 30-day grace period', 'Reminder with renewal link'],
];

const ALWAYS_ACCESSIBLE = ['View all transactions and the ledger', 'View reports (P&L, Balance Sheet, Trial Balance)', 'Download and export reports', 'View the chart of accounts', 'Access the audit trail'];
const BLOCKED_IN_READONLY = ['Record new expenses, invoices, or bills', 'Post journal entries', 'Import payroll runs', 'Add new users', 'Change company settings'];

const STATUS_STYLE = {
  active: { bg: 'linear-gradient(120deg, #0f6e56, #1d9e75)', label: 'License Active' },
  trial: { bg: 'linear-gradient(120deg, #854f0b, #ba7517)', label: 'Demo / Trial — License Active' },
  grace_period: { bg: 'linear-gradient(120deg, #993c1d, #d85a30)', label: 'Grace Period — Renew Now' },
  expired: { bg: 'linear-gradient(120deg, #791f1f, #c94141)', label: 'License Expired' },
};

export default function License({ isSuperAdmin }) {
  return isSuperAdmin ? <SuperAdminLicenseView /> : <CompanyLicenseView />;
}

function CompanyLicenseView() {
  const [license, setLicense] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [addons, setAddons] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getLicense().then(setLicense).catch((err) => setError(err.message));
    api.listPricingTiers().then((r) => setTiers(r.tiers)).catch(() => {});
    api.listPricingAddons().then((r) => setAddons(r.addons)).catch(() => {});
  }, []);

  if (error) return <div style={{ padding: 24, color: 'var(--cb-danger)' }}>{error}</div>;
  if (!license) return <div style={{ padding: 24, color: 'var(--cb-text-secondary)' }}>Loading…</div>;

  const statusMeta = STATUS_STYLE[license.status] || STATUS_STYLE.active;
  const seatPct = Math.min(100, Math.round((license.usersActive / Math.max(1, license.userLimit)) * 100));

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>License Management</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 16 }}>
        Manage your ChronoBooks subscription — view status, user usage, and renewal options.
      </p>

      <div
        className="cb-fade-up"
        style={{
          background: statusMeta.bg, borderRadius: 16, padding: '22px 26px', color: '#fff', marginBottom: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{license.planName} — {statusMeta.label}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            {license.status === 'trial' && 'You are on a limited demo license. Upgrade to a full plan before it expires to keep everything running.'}
            {license.status === 'active' && 'Your subscription is active and in good standing.'}
            {license.status === 'grace_period' && 'Your license has expired but you are still in the grace period — renew now to avoid read-only mode.'}
            {license.status === 'expired' && 'Your license has expired and the grace period has ended. Contact your Super Administrator.'}
          </div>
        </div>
        {license.daysLeft !== null && (
          <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '3px solid rgba(255,255,255,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{Math.max(0, license.daysLeft)}</div>
            <div style={{ fontSize: 9 }}>days left</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🔑 License details</div>
          <DetailRow label="License key" value={maskKey(license.licenseKey)} mono />
          <DetailRow label="Customer ID" value={license.customerRef} mono />
          <DetailRow label="Plan" value={<><span>{license.planName}</span> <StatusTag status={license.status} /></>} />
          <DetailRow label="Activated on" value={license.activatedAt} />
          <DetailRow label="Last renewed" value={license.lastRenewedAt || '—'} />
          <DetailRow label="Expires" value={license.expiresAt} />
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>👥 Seat usage</div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>{license.usersActive} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--cb-text-secondary)' }}>/ {license.userLimit}</span></div>
          <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 8 }}>Active users on licensed seats</div>
          <div style={{ height: 8, borderRadius: 5, background: 'var(--cb-bg)', overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', width: `${seatPct}%`, background: seatPct >= 90 ? 'var(--cb-danger)' : 'var(--cb-primary-400)', borderRadius: 5 }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)', marginBottom: 14 }}>{seatPct}% of seats used</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => document.getElementById('pricing-table-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={buttonStyle}
            >
              Upgrade plan
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('pricing-table-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ ...buttonStyle, background: 'var(--cb-bg)', color: 'var(--cb-text-primary)' }}
            >
              Renew now
            </button>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>🔔 Automatic renewal reminders</div>
        {REMINDERS.map(([when, what]) => (
          <div key={when} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--cb-border)', fontSize: 13 }}>
            <span style={{ color: 'var(--cb-text-secondary)' }}>{when}</span><span>{what}</span>
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🧩 Module access</div>
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 12 }}>Core Accounting is always available. Module access is controlled by your ChronoBooks Super Administrator.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {MODULES.map((m) => {
            const on = license.modules[m.key];
            return (
              <div key={m.key} style={{ border: `1px solid ${on ? 'var(--cb-primary-400)' : 'var(--cb-border)'}`, background: on ? 'var(--cb-primary-50)' : 'var(--cb-bg)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 16, marginBottom: 4 }}>{m.icon}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: 'var(--cb-text-secondary)', marginTop: 2 }}>{on ? 'Enabled' : 'Not included'}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cb-success)', marginBottom: 8 }}>✓ Always accessible</div>
          {ALWAYS_ACCESSIBLE.map((t) => <div key={t} style={{ fontSize: 13, padding: '4px 0' }}>{t}</div>)}
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cb-danger)', marginBottom: 8 }}>✗ Blocked in read-only mode</div>
          {BLOCKED_IN_READONLY.map((t) => <div key={t} style={{ fontSize: 13, padding: '4px 0' }}>{t}</div>)}
        </div>
      </div>

      <div id="pricing-table-anchor" />
      <PricingTable tiers={tiers} addons={addons} editable={false} style={{ marginTop: 16 }} />
    </div>
  );
}

function SuperAdminLicenseView() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [current, setCurrent] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [addons, setAddons] = useState([]);
  const [upgradeRequests, setUpgradeRequests] = useState([]);
  const [form, setForm] = useState({ licenseType: 'paid', planName: '', userLimit: 5, expiryYears: 1, modules: {}, aiAssistantAllowance: 'none' });
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  function load() {
    api.listSystemCompanies().then((r) => setCompanies(r.companies)).catch((err) => setError(err.message));
    api.listPricingTiers().then((r) => setTiers(r.tiers)).catch(() => {});
    api.listPricingAddons().then((r) => setAddons(r.addons)).catch(() => {});
    api.listUpgradeRequests().then((r) => setUpgradeRequests(r.requests)).catch(() => {});
  }
  useEffect(load, []);

  const [reviewTierName, setReviewTierName] = useState(null);

  /** Jump the license generator to this company and pre-fill it from the tier they asked
   * for -- deferred to the selectedCompanyId effect below (via reviewTierName) so it wins
   * over that effect's own form reset instead of racing it. */
  function reviewRequest(req) {
    setSelectedCompanyId(req.companyId);
    setReviewTierName(req.requestedPlanName);
    document.getElementById('license-generator-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    if (!selectedCompanyId) { setCurrent(null); return; }
    api.getCompanyLicense(selectedCompanyId).then((c) => {
      setCurrent(c);
      if (reviewTierName) {
        const tier = tiers.find((t) => t.plan_name === reviewTierName);
        setReviewTierName(null);
        if (tier) {
          const modules = Object.fromEntries(MODULES.map((m) => [m.key, (tier.modulesIncluded || []).includes(m.key)]));
          setForm({ licenseType: 'paid', planName: tier.plan_name, userLimit: tier.userLimitNumeric || c.userLimit, expiryYears: 1, modules, aiAssistantAllowance: 'none' });
          return;
        }
      }
      setForm({ licenseType: c.licenseType, planName: c.planName, userLimit: c.userLimit, expiryYears: 1, modules: { ...c.modules }, aiAssistantAllowance: 'none' });
    }).catch((err) => setError(err.message));
  }, [selectedCompanyId, reviewTierName, tiers]);

  function applyPreset(preset) {
    const all = Object.fromEntries(MODULES.map((m) => [m.key, preset === 'full']));
    if (preset === 'ops') {
      ['inventoryEnabled', 'fixedAssetsEnabled', 'procurementEnabled', 'manufacturingEnabled', 'posEnabled'].forEach((k) => (all[k] = true));
    }
    setForm((f) => ({ ...f, modules: all }));
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setError('');
    setSaved('');
    if (!selectedCompanyId) return setError('Select a customer company first.');
    try {
      await api.generateLicense({ companyId: selectedCompanyId, ...form });
      setSaved('License generated and activated.');
      const c = await api.getCompanyLicense(selectedCompanyId);
      setCurrent(c);
      api.listUpgradeRequests().then((r) => setUpgradeRequests(r.requests)).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    setError('');
    if (!selectedCompanyId) return setError('Select a customer company first.');
    try {
      await api.deleteSystemCompany(selectedCompanyId, confirmName);
      setConfirmName('');
      setSelectedCompanyId('');
      setCurrent(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>License Management</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 16 }}>
        Manage ChronoBooks licenses — view status, seat usage, and renewal options for any customer company.
      </p>

      {upgradeRequests.length > 0 && (
        <div style={{ ...cardStyle, background: '#e8f2fd', border: '1px solid var(--cb-primary-400)', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🔔 Pending upgrade requests ({upgradeRequests.length})</div>
          <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)', marginBottom: 12 }}>
            These companies picked a plan from their upgrade screen — review and activate below.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {upgradeRequests.map((r) => (
                <tr key={r.companyId} style={{ borderTop: '1px solid var(--cb-border)' }}>
                  <td style={tdStyle}><strong>{r.companyName}</strong></td>
                  <td style={tdStyle}>Currently: {r.currentPlanName}</td>
                  <td style={tdStyle}>Requested: <strong>{r.requestedPlanName}</strong></td>
                  <td style={{ ...tdStyle, color: 'var(--cb-text-secondary)' }}>{new Date(r.requestedAt).toLocaleDateString()}</td>
                  <td style={tdStyle}><button type="button" onClick={() => reviewRequest(r)} style={smallButtonStyle}>Review &amp; activate</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form id="license-generator-form" onSubmit={handleGenerate} style={{ ...cardStyle, background: '#fdf6e8', border: '1px solid var(--cb-amber-400)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🔑 Super admin — license generator</div>
          <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>Issue or update a license for any customer company</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <label style={labelStyle}>
            Customer company
            <select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)} style={inputStyle}>
              <option value="">Select a company…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Current package
            {current ? (
              <div style={{ ...inputStyle, background: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                {current.planName} <StatusTag status={current.status} />
              </div>
            ) : (
              <div style={{ ...inputStyle, background: '#fff', color: 'var(--cb-text-secondary)' }}>Select a company above</div>
            )}
          </label>
        </div>

        <div style={{ ...labelStyle, marginBottom: 6 }}>License type</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          {[{ v: 'paid', l: 'Paid — Annual', d: 'Standard full license, billed yearly' }, { v: 'demo', l: 'Demo / Trial', d: 'Time-boxed, you choose the length below' }].map((t) => (
            <button
              type="button" key={t.v} onClick={() => setForm({ ...form, licenseType: t.v })}
              style={{
                flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                border: form.licenseType === t.v ? '2px solid var(--cb-amber-600)' : '1px solid var(--cb-border)',
                background: form.licenseType === t.v ? '#fbe9c8' : '#fff',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t.l}</div>
              <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>{t.d}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
          <label style={labelStyle}>User limit<input type="number" min="1" value={form.userLimit} onChange={(e) => setForm({ ...form, userLimit: Number(e.target.value) })} style={inputStyle} /></label>
          <label style={labelStyle}>Plan name<input placeholder="e.g. Business" value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} style={inputStyle} /></label>
          <label style={labelStyle}>Expiry (years from today)<input type="number" min="1" value={form.expiryYears} onChange={(e) => setForm({ ...form, expiryYears: Number(e.target.value) })} style={inputStyle} /></label>
        </div>

        <div style={{ ...labelStyle, marginBottom: 6 }}>Module bundles included</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
          {MODULES.map((m) => (
            <label key={m.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fff', border: '1px solid var(--cb-border)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
              <input type="checkbox" checked={!!form.modules[m.key]} onChange={(e) => setForm({ ...form, modules: { ...form.modules, [m.key]: e.target.checked } })} style={{ marginTop: 2 }} />
              <span><strong>{m.icon} {m.label}</strong><br /><span style={{ color: 'var(--cb-text-secondary)' }}>{m.description}</span></span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button type="button" onClick={() => applyPreset('full')} style={smallButtonStyle}>Full suite</button>
          <button type="button" onClick={() => applyPreset('core')} style={smallButtonStyle}>Core only</button>
          <button type="button" onClick={() => applyPreset('ops')} style={smallButtonStyle}>Ops bundle</button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)', marginBottom: 14 }}>
          The AI Assistant is free for every company on every plan — it isn't part of this license.
        </div>

        {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {saved && <div style={{ color: 'var(--cb-success)', fontSize: 13, marginBottom: 10 }}>{saved}</div>}

        <button type="submit" style={{ ...buttonStyle, background: 'var(--cb-amber-600)', color: '#fff' }}>Generate &amp; activate license</button>
      </form>

      <div style={{ ...cardStyle, background: '#fdecea', border: '1px solid var(--cb-danger)', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cb-danger)', marginBottom: 4 }}>⚠️ Danger zone — delete a company</div>
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 12 }}>
          Permanent. Removes every user, account, and transaction under it. This cannot be undone — there's no recycle bin.
          Only use this for genuine duplicates or test data, never a company with real financial history you might need later.
        </div>
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          Selected company: <strong>{selectedCompany ? selectedCompany.name : 'none — pick one above'}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <label style={{ ...labelStyle, flex: 1 }}>
            Type the company name to confirm
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder="Exact company name" style={inputStyle} />
          </label>
          <button type="button" onClick={handleDelete} style={{ ...buttonStyle, background: 'var(--cb-danger)', color: '#fff' }}>Delete company permanently</button>
        </div>
      </div>

      <div style={{ ...cardStyle, background: '#fdf6e8', border: '1px solid var(--cb-amber-400)', marginBottom: 16, fontSize: 12 }}>
        You're signed in as a platform Super Administrator, so this page isn't scoped to one company. Use the license generator above to view or issue a license for any customer company.
      </div>

      <PricingTable tiers={tiers} addons={addons} editable onChanged={load} />
    </div>
  );
}

function PricingTable({ tiers, addons, editable, onChanged, style }) {
  const [editingTier, setEditingTier] = useState(null);
  const [tierDraft, setTierDraft] = useState({});
  const [editingAddon, setEditingAddon] = useState(null);
  const [addonDraft, setAddonDraft] = useState({});
  const [requestingTierId, setRequestingTierId] = useState(null);
  const [requestedTierId, setRequestedTierId] = useState(null);
  const [requestError, setRequestError] = useState('');

  async function saveTier(id) {
    await api.updatePricingTier(id, { planName: tierDraft.plan_name, companiesIncluded: tierDraft.companies_included, usersIncluded: tierDraft.users_included, annualFee: tierDraft.annual_fee });
    setEditingTier(null);
    onChanged && onChanged();
  }
  async function saveAddon(id) {
    await api.updatePricingAddon(id, { label: addonDraft.label, annualFee: addonDraft.annual_fee });
    setEditingAddon(null);
    onChanged && onChanged();
  }

  /** Company-side "Upgrade" — no payment processor wired up, so this just records the
   * request; it shows up in the Super Administrator's Pending upgrade requests panel. */
  async function requestTier(id) {
    setRequestingTierId(id);
    setRequestError('');
    try {
      await api.requestUpgrade(id);
      setRequestedTierId(id);
    } catch (err) {
      setRequestError(err.message);
    } finally {
      setRequestingTierId(null);
    }
  }

  return (
    <div style={style}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>💳 Pricing tiers — annual subscription</div>
          <div style={{ fontSize: 11, color: 'var(--cb-text-secondary)' }}>Company + Users basis</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Plan</th><th style={thStyle}>Companies</th><th style={thStyle}>Users included</th><th style={thStyle}>Annual fee</th><th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                {editingTier === t.id ? (
                  <>
                    <td style={tdStyle}><input value={tierDraft.plan_name} onChange={(e) => setTierDraft({ ...tierDraft, plan_name: e.target.value })} style={{ ...inputStyle, marginTop: 0 }} /></td>
                    <td style={tdStyle}><input value={tierDraft.companies_included} onChange={(e) => setTierDraft({ ...tierDraft, companies_included: e.target.value })} style={{ ...inputStyle, marginTop: 0 }} /></td>
                    <td style={tdStyle}><input value={tierDraft.users_included} onChange={(e) => setTierDraft({ ...tierDraft, users_included: e.target.value })} style={{ ...inputStyle, marginTop: 0 }} /></td>
                    <td style={tdStyle}><input value={tierDraft.annual_fee} onChange={(e) => setTierDraft({ ...tierDraft, annual_fee: e.target.value })} style={{ ...inputStyle, marginTop: 0 }} /></td>
                    <td style={tdStyle}><button type="button" onClick={() => saveTier(t.id)} style={smallButtonStyle}>Save</button></td>
                  </>
                ) : (
                  <>
                    <td style={tdStyle}>{t.plan_name}</td>
                    <td style={tdStyle}>{t.companies_included}</td>
                    <td style={tdStyle}>{t.users_included}</td>
                    <td style={tdStyle}>{t.annual_fee}</td>
                    <td style={tdStyle}>
                      {editable ? (
                        <button type="button" onClick={() => { setEditingTier(t.id); setTierDraft(t); }} style={linkButtonStyle}>✎ Edit</button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => requestTier(t.id)}
                          disabled={requestingTierId === t.id}
                          style={smallButtonStyle}
                        >
                          {requestingTierId === t.id ? 'Requesting…' : requestedTierId === t.id ? 'Requested ✓' : 'Upgrade'}
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!editable && requestedTierId && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--cb-success)' }}>
            ✓ Request sent — your Super Administrator will review and activate it.
          </div>
        )}
        {!editable && requestError && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--cb-danger)' }}>{requestError}</div>
        )}
      </div>

      <div style={{ ...cardStyle, marginTop: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>➕ Add-ons</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {addons.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                {editingAddon === a.id ? (
                  <>
                    <td style={tdStyle}><input value={addonDraft.label} onChange={(e) => setAddonDraft({ ...addonDraft, label: e.target.value })} style={{ ...inputStyle, marginTop: 0 }} /></td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}><input value={addonDraft.annual_fee} onChange={(e) => setAddonDraft({ ...addonDraft, annual_fee: e.target.value })} style={{ ...inputStyle, marginTop: 0 }} /></td>
                    <td style={tdStyle}><button type="button" onClick={() => saveAddon(a.id)} style={smallButtonStyle}>Save</button></td>
                  </>
                ) : (
                  <>
                    <td style={tdStyle}>{a.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--cb-text-secondary)' }}>{a.annual_fee}</td>
                    <td style={tdStyle}>{editable && <button type="button" onClick={() => { setEditingAddon(a.id); setAddonDraft(a); }} style={linkButtonStyle}>✎ Edit</button>}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--cb-border)', fontSize: 13 }}>
      <span style={{ color: 'var(--cb-text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

function StatusTag({ status }) {
  const colors = {
    active: { bg: '#e1f5ee', fg: '#0f6e56' }, trial: { bg: '#faeeda', fg: '#854f0b' },
    grace_period: { bg: '#faece7', fg: '#993c1d' }, expired: { bg: '#fcebeb', fg: '#a32d2d' },
  };
  const c = colors[status] || colors.active;
  return <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: c.bg, color: c.fg, borderRadius: 999, padding: '2px 8px' }}>{status.replace('_', ' ')}</span>;
}

function maskKey(key) {
  if (!key) return '—';
  const parts = key.split('-');
  if (parts.length < 2) return key;
  return `${parts[0]}-••••-••••-${parts[parts.length - 1]}`;
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)', display: 'block' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 14, background: '#fff' };
const buttonStyle = { padding: '10px 16px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 13 };
const smallButtonStyle = { padding: '6px 10px', border: '1px solid var(--cb-border)', borderRadius: 6, background: '#fff', color: 'var(--cb-text-primary)', fontWeight: 600, fontSize: 11 };
const linkButtonStyle = { border: 'none', background: 'transparent', color: 'var(--cb-primary-600)', fontSize: 12, fontWeight: 600 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px' };
const cardStyle = { background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18 };
