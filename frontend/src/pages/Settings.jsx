import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { BRAND_PRESETS, applyBrandPreset } from '../theme/presets';
import SignaturePad from '../components/SignaturePad';

const CURRENCIES = ['GHS', 'USD', 'NGN', 'GBP', 'EUR'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const INDUSTRIES = ['Retail', 'Manufacturing', 'Mining', 'Agriculture', 'Construction', 'Hospitality', 'Professional Services', 'Technology', 'NGO / Non-profit', 'Other'];
const COMPANY_TYPES = ['Sole Proprietor', 'Partnership', 'Limited Liability Company', 'NGO'];
const TAX_METHODS = [{ value: 'exclusive', label: 'Tax exclusive (added on top)' }, { value: 'inclusive', label: 'Tax inclusive (already in price)' }];
const ACCOUNTING_METHODS = [{ value: 'accrual', label: 'Accrual' }, { value: 'cash', label: 'Cash' }];
const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

const TABS = ['My Account', 'Company Profile', 'Tax & Preferences', 'Chart of Accounts', 'Organization', 'Users', 'Roles', 'Parameters', 'Security', 'Approvals', 'AI Assistant'];

export default function Settings({ isAdmin, isSuperAdmin }) {
  const [tab, setTab] = useState('Company Profile');
  const [company, setCompany] = useState(null);
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    api.getCompany().then(setCompany).catch((err) => setError(err.message));
    api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
    api.listChartOfAccounts().then((r) => setAccounts(r.accounts)).catch(() => {});
    api.listRoles().then((r) => setRoles(r.roles)).catch(() => {});
    api.listBranches().then((r) => setBranches(r.branches)).catch(() => {});
    api.listDepartments().then((r) => setDepartments(r.departments)).catch(() => {});
  }

  useEffect(load, []);

  function set(patch) {
    setCompany((c) => ({ ...c, ...patch }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      await api.updateCompany(company);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function selectPreset(key) {
    set({ brandAccentColor: key });
    applyBrandPreset(key); // instant preview, before saving
  }

  if (!company) return <div style={{ padding: 24, color: 'var(--cb-text-secondary)' }}>Loading…</div>;

  // The Super Administrator is a singular, platform-level account (not tied to any one
  // company) — it never appears as an assignable role or as a row in a company's own
  // Users list, the same way ChronoSync keeps its platform owner separate from
  // per-company user management.
  const assignableRoles = roles.filter((r) => r.code !== 'super_administrator');
  const visibleUsers = users.filter((u) => u.role_code !== 'super_administrator');

  // Login history and the audit log are sensitive — only Administrators (and the
  // Super Administrator) can even see the Security tab; everyone else keeps the
  // seven tabs above it.
  const visibleTabs = isAdmin ? TABS : TABS.filter((t) => t !== 'Security' && t !== 'AI Assistant' && t !== 'Approvals');

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Settings</h1>
      <p style={{ fontSize: 13, color: 'var(--cb-text-secondary)', marginTop: 0, marginBottom: 16 }}>
        Company setup, tax configuration, chart of accounts, and users.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid var(--cb-border)',
              background: tab === t ? 'var(--cb-primary-400)' : 'var(--cb-surface)',
              color: tab === t ? 'var(--cb-primary-900)' : 'var(--cb-text-primary)', fontWeight: 600, fontSize: 13,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {!isAdmin && tab !== 'Chart of Accounts' && tab !== 'My Account' && tab !== 'Parameters' && tab !== 'Security' && (
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 12 }}>Only Administrators can edit these fields.</div>
      )}

      {tab === 'My Account' && <MyAccountTab />}

      {(tab === 'Company Profile' || tab === 'Tax & Preferences' || tab === 'Approvals') && (
        <form onSubmit={handleSave} style={{ maxWidth: 900 }}>
          {tab === 'Company Profile' && <CompanyProfileTab company={company} set={set} isAdmin={isAdmin} selectPreset={selectPreset} />}
          {tab === 'Tax & Preferences' && <TaxPreferencesTab company={company} set={set} isAdmin={isAdmin} />}
          {tab === 'Approvals' && <ApprovalsSettingsTab company={company} set={set} isAdmin={isAdmin} />}

          {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginTop: 10 }}>{error}</div>}
          {saved && <div style={{ color: 'var(--cb-success)', fontSize: 13, marginTop: 10 }}>Saved.</div>}
          {isAdmin && <button type="submit" disabled={saving} style={{ ...buttonStyle, marginTop: 16 }}>{saving ? 'Saving…' : 'Save changes'}</button>}
        </form>
      )}

      {tab === 'Chart of Accounts' && (
        <ChartOfAccountsTab accounts={accounts} isAdmin={isAdmin} onChanged={load} />
      )}

      {tab === 'Organization' && <OrganizationTab branches={branches} departments={departments} isAdmin={isAdmin} onChanged={load} />}

      {tab === 'Users' && <UsersTab users={visibleUsers} roles={assignableRoles} branches={branches} departments={departments} isAdmin={isAdmin} onChanged={load} />}

      {tab === 'Roles' && <RolesTab roles={assignableRoles} isAdmin={isAdmin} />}

      {tab === 'Parameters' && <ParametersTab isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} />}

      {tab === 'Security' && <SecurityTab isAdmin={isAdmin} />}

      {tab === 'AI Assistant' && <AiAssistantTab />}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>{children}</div>
    </div>
  );
}
function Field({ label, value, onChange, disabled, type = 'text', span }) {
  return (
    <label style={{ ...labelStyle, gridColumn: span ? `span ${span}` : undefined }}>
      {label}
      <input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} style={inputStyle} disabled={disabled} />
    </label>
  );
}
function Select({ label, value, onChange, options, disabled, span }) {
  return (
    <label style={{ ...labelStyle, gridColumn: span ? `span ${span}` : undefined }}>
      {label}
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} style={inputStyle} disabled={disabled}>
        <option value="">Select…</option>
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  );
}
function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      {label}
    </label>
  );
}

function CompanyProfileTab({ company: c, set, isAdmin, selectPreset }) {
  const d = isAdmin ? false : true;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Company information">
        <Field label="Company name" value={c.name} onChange={(v) => set({ name: v })} disabled={d} />
        <Field label="Trading name" value={c.tradingName} onChange={(v) => set({ tradingName: v })} disabled={d} />
        <Field label="Registration number" value={c.registrationNumber} onChange={(v) => set({ registrationNumber: v })} disabled={d} />
        <Field label="Tax Identification Number (TIN)" value={c.tin} onChange={(v) => set({ tin: v })} disabled={d} />
        <Field label="VAT registration number" value={c.vatNumber} onChange={(v) => set({ vatNumber: v })} disabled={d} />
        <Field label="NHIL registration" value={c.nhilRegistration} onChange={(v) => set({ nhilRegistration: v })} disabled={d} />
        <Field label="SSNIT employer number" value={c.ssnitEmployerNumber} onChange={(v) => set({ ssnitEmployerNumber: v })} disabled={d} />
        <Select label="Industry" value={c.industry} onChange={(v) => set({ industry: v })} options={INDUSTRIES} disabled={d} />
        <Select label="Company type" value={c.companyType} onChange={(v) => set({ companyType: v })} options={COMPANY_TYPES} disabled={d} />
        <Select label="Fiscal year start" value={MONTHS[(c.fiscalYearStartMonth || 1) - 1]} onChange={(v) => set({ fiscalYearStartMonth: MONTHS.indexOf(v) + 1 })} options={MONTHS} disabled={d} />
        <Select label="Fiscal year end" value={MONTHS[(c.fiscalYearEndMonth || 12) - 1]} onChange={(v) => set({ fiscalYearEndMonth: MONTHS.indexOf(v) + 1 })} options={MONTHS} disabled={d} />
        <Select label="Base currency" value={c.currency} onChange={(v) => set({ currency: v })} options={CURRENCIES} disabled={d} />
        <Select label="Reporting currency (optional)" value={c.reportingCurrency} onChange={(v) => set({ reportingCurrency: v })} options={CURRENCIES} disabled={d} />
        <Field label="Time zone" value={c.timezone} onChange={(v) => set({ timezone: v })} disabled={d} />
        <Field label="Language" value={c.language} onChange={(v) => set({ language: v })} disabled={d} />
      </Section>

      <Section title="Contact details">
        <Field label="Phone number" value={c.phone} onChange={(v) => set({ phone: v })} disabled={d} />
        <Field label="Mobile" value={c.mobile} onChange={(v) => set({ mobile: v })} disabled={d} />
        <Field label="Email" type="email" value={c.email} onChange={(v) => set({ email: v })} disabled={d} />
        <Field label="Website" value={c.website} onChange={(v) => set({ website: v })} disabled={d} />
        <Field label="Postal address" value={c.postalAddress} onChange={(v) => set({ postalAddress: v })} disabled={d} />
        <Field label="Digital address" value={c.digitalAddress} onChange={(v) => set({ digitalAddress: v })} disabled={d} />
        <Field label="Country" value={c.country} onChange={(v) => set({ country: v })} disabled={d} />
        <Field label="Region" value={c.region} onChange={(v) => set({ region: v })} disabled={d} />
        <Field label="City" value={c.city} onChange={(v) => set({ city: v })} disabled={d} />
        <Field label="GPS location" value={c.gpsLocation} onChange={(v) => set({ gpsLocation: v })} disabled={d} />
        <Field label="Street address" value={c.address} onChange={(v) => set({ address: v })} disabled={d} span={3} />
        <Field label="Logo URL" value={c.logoUrl} onChange={(v) => set({ logoUrl: v })} disabled={d} span={1} />
        <Field label="Stamp image URL (optional)" value={c.stampUrl} onChange={(v) => set({ stampUrl: v })} disabled={d} span={1} />
        <Field label="Signature image URL (optional)" value={c.signatureUrl} onChange={(v) => set({ signatureUrl: v })} disabled={d} span={1} />
      </Section>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Brand accent color</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {Object.entries(BRAND_PRESETS).map(([key, preset]) => (
            <button
              type="button" key={key} onClick={() => isAdmin && selectPreset(key)} disabled={!isAdmin} title={preset.description}
              style={{
                padding: '10px 8px', borderRadius: 8,
                border: c.brandAccentColor === key ? '2px solid var(--cb-primary-600)' : '1px solid var(--cb-border)',
                background: 'var(--cb-surface)', cursor: isAdmin ? 'pointer' : 'default', textAlign: 'center',
              }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 6, background: preset.swatch, margin: '0 auto 6px' }} />
              <div style={{ fontSize: 11, fontWeight: 600 }}>{preset.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TaxPreferencesTab({ company: c, set, isAdmin }) {
  const d = isAdmin ? false : true;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Tax configuration">
        <Toggle label="VAT registered" checked={c.vatRegistered} onChange={(v) => set({ vatRegistered: v })} disabled={d} />
        <Field label="VAT rate (%)" type="number" value={c.vatRate} onChange={(v) => set({ vatRate: Number(v) })} disabled={d} />
        <Field label="NHIL rate (%)" type="number" value={c.nhilRate} onChange={(v) => set({ nhilRate: Number(v) })} disabled={d} />
        <Field label="GETFund levy (%)" type="number" value={c.getfundRate} onChange={(v) => set({ getfundRate: Number(v) })} disabled={d} />
        <Field label="COVID levy (%)" type="number" value={c.covidLevyRate} onChange={(v) => set({ covidLevyRate: Number(v) })} disabled={d} />
        <Toggle label="Withholding tax enabled" checked={c.withholdingTaxEnabled} onChange={(v) => set({ withholdingTaxEnabled: v })} disabled={d} />
        <Field label="Corporate tax rate (%)" type="number" value={c.corporateTaxRate} onChange={(v) => set({ corporateTaxRate: Number(v) })} disabled={d} />
        <Select label="Default tax method" value={c.defaultTaxMethod} onChange={(v) => set({ defaultTaxMethod: v })} options={TAX_METHODS} disabled={d} />
      </Section>

      <Section title="Accounting preferences">
        <Select label="Accounting method" value={c.accountingMethod} onChange={(v) => set({ accountingMethod: v })} options={ACCOUNTING_METHODS} disabled={d} />
        <Field label="Decimal places" type="number" value={c.decimalPlaces} onChange={(v) => set({ decimalPlaces: Number(v) })} disabled={d} />
        <div />
        <Toggle label="Allow negative stock" checked={c.allowNegativeStock} onChange={(v) => set({ allowNegativeStock: v })} disabled={d} />
        <Toggle label="Multi-currency" checked={c.multiCurrencyEnabled} onChange={(v) => set({ multiCurrencyEnabled: v })} disabled={d} />
        <Toggle label="Cost centres" checked={c.costCentresEnabled} onChange={(v) => set({ costCentresEnabled: v })} disabled={d} />
        <Toggle label="Budgeting enabled" checked={c.budgetingEnabled} onChange={(v) => set({ budgetingEnabled: v })} disabled={d} />
        <Toggle label="Bank reconciliation enabled" checked={c.bankReconciliationEnabled} onChange={(v) => set({ bankReconciliationEnabled: v })} disabled={d} />
        <Toggle label="Inventory enabled" checked={c.inventoryEnabled} onChange={(v) => set({ inventoryEnabled: v })} disabled={d} />
        <Toggle label="Fixed assets enabled" checked={c.fixedAssetsEnabled} onChange={(v) => set({ fixedAssetsEnabled: v })} disabled={d} />
        <Toggle label="Payroll integration enabled" checked={c.payrollIntegrationEnabled} onChange={(v) => set({ payrollIntegrationEnabled: v })} disabled={d} />
        <Toggle label="Recurring transactions" checked={c.recurringTransactionsEnabled} onChange={(v) => set({ recurringTransactionsEnabled: v })} disabled={d} />
      </Section>
    </div>
  );
}

function ApprovalsSettingsTab({ company: c, set, isAdmin }) {
  const d = isAdmin ? false : true;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Approval workflow">
        <div style={{ gridColumn: 'span 3', fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 2 }}>
          Turn a module on to require sign-off before it posts to the books — nothing changes for a module left off.
          Decisions (and who signed them) show up in the Approvals inbox.
        </div>
        <Toggle label="Sales invoices" checked={c.approvalRequiredSales} onChange={(v) => set({ approvalRequiredSales: v })} disabled={d} />
        <Toggle label="Purchase bills" checked={c.approvalRequiredPurchases} onChange={(v) => set({ approvalRequiredPurchases: v })} disabled={d} />
        <Toggle label="Customer receipts" checked={c.approvalRequiredReceipts} onChange={(v) => set({ approvalRequiredReceipts: v })} disabled={d} />
        <Toggle label="Per Diem expense claims" checked={c.approvalRequiredExpenses} onChange={(v) => set({ approvalRequiredExpenses: v })} disabled={d} />
        <Toggle label="Payroll imports" checked={c.approvalRequiredPayroll} onChange={(v) => set({ approvalRequiredPayroll: v })} disabled={d} />
      </Section>
    </div>
  );
}

function ChartOfAccountsTab({ accounts, isAdmin, onChanged }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', type: 'expense', groupName: '' });
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createAccount(form);
      setForm({ code: '', name: '', type: 'expense', groupName: '' });
      setShowAdd(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRename(accountId) {
    try {
      await api.updateAccount(accountId, { name: editName });
      setEditingId(null);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  const grouped = ACCOUNT_TYPES.map((type) => ({ type, rows: accounts.filter((a) => a.type === type) }));

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>Auto-created at setup. You can extend it, rename accounts, or move them to a different group.</div>
        {isAdmin && <button type="button" onClick={() => setShowAdd((v) => !v)} style={buttonStyle}>+ Add account</button>}
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 8, marginBottom: 14, alignItems: 'end' }}>
          <label style={labelStyle}>Code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} required /></label>
          <label style={labelStyle}>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Group<input value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} style={inputStyle} required /></label>
          <button type="submit" style={buttonStyle}>Add</button>
        </form>
      )}

      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {grouped.map(({ type, rows }) => rows.length > 0 && (
        <div key={type} style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cb-text-secondary)', textTransform: 'capitalize', marginBottom: 8 }}>{type}</div>
          {rows.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--cb-border)', fontSize: 13 }}>
              <span style={{ color: 'var(--cb-text-secondary)', width: 60 }}>{a.code}</span>
              {editingId === a.id ? (
                <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
              ) : (
                <span style={{ flex: 1 }}>{a.name}</span>
              )}
              <span style={{ color: 'var(--cb-text-secondary)', marginRight: 10 }}>{a.group_name}</span>
              {isAdmin && (
                editingId === a.id ? (
                  <button type="button" onClick={() => handleRename(a.id)} style={{ ...buttonStyle, marginTop: 0, padding: '5px 10px' }}>Save</button>
                ) : (
                  <button type="button" onClick={() => { setEditingId(a.id); setEditName(a.name); }} style={{ border: 'none', background: 'transparent', color: 'var(--cb-primary-600)', fontSize: 12, fontWeight: 600 }}>Edit</button>
                )
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MyAccountTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [signature, setSignature] = useState(null);
  const [savedSignature, setSavedSignature] = useState(null);
  const [sigError, setSigError] = useState('');
  const [sigSaved, setSigSaved] = useState(false);

  useEffect(() => {
    api.getMySignature().then((r) => setSavedSignature(r.signatureData)).catch(() => {});
  }, []);

  async function handleSaveSignature() {
    setSigError('');
    setSigSaved(false);
    if (!signature) return setSigError('Draw your signature first.');
    try {
      await api.saveMySignature(signature);
      setSavedSignature(signature);
      setSigSaved(true);
    } catch (err) {
      setSigError(err.message);
    }
  }

  async function handleRemoveSignature() {
    setSigError('');
    try {
      await api.deleteMySignature();
      setSavedSignature(null);
      setSignature(null);
    } catch (err) {
      setSigError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    if (newPassword !== confirmPassword) return setError('New password and confirmation do not match.');
    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Change your password</div>
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 14 }}>
          This works for every account, including the Super Administrator — the one screen that always applies to you personally, no matter what company you're viewing.
        </div>
        <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />
        <div style={{ height: 10 }} />
        <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} />
        <div style={{ height: 10 }} />
        <Field label="Confirm new password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
        {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        {saved && <div style={{ color: 'var(--cb-success)', fontSize: 13, marginTop: 10 }}>Password updated.</div>}
        <button type="submit" disabled={saving} style={{ ...buttonStyle, marginTop: 14 }}>{saving ? 'Saving…' : 'Update password'}</button>
      </form>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>My signature</div>
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 12 }}>
          Saved once, reused automatically whenever you approve something in the Approvals inbox — you can always draw a fresh one there instead.
        </div>
        <SignaturePad initialDataUrl={savedSignature} onChange={setSignature} />
        {sigError && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginTop: 10 }}>{sigError}</div>}
        {sigSaved && <div style={{ color: 'var(--cb-success)', fontSize: 13, marginTop: 10 }}>Signature saved.</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button type="button" onClick={handleSaveSignature} style={buttonStyle}>Save signature</button>
          {savedSignature && (
            <button type="button" onClick={handleRemoveSignature} style={{ ...buttonStyle, background: 'var(--cb-bg)', color: 'var(--cb-text-primary)', border: '1px solid var(--cb-border)' }}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OrganizationTab({ branches, departments, isAdmin, onChanged }) {
  const [newBranch, setNewBranch] = useState('');
  const [newDept, setNewDept] = useState('');
  const [error, setError] = useState('');

  async function addBranch(e) {
    e.preventDefault();
    setError('');
    try { await api.createBranch({ name: newBranch }); setNewBranch(''); onChanged(); } catch (err) { setError(err.message); }
  }
  async function addDept(e) {
    e.preventDefault();
    setError('');
    try { await api.createDepartment({ name: newDept }); setNewDept(''); onChanged(); } catch (err) { setError(err.message); }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 760 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Branches</div>
        {branches.map((b) => (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--cb-border)', fontSize: 13 }}>
            <span>{b.name}</span>
            {b.isHeadOffice && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cb-primary-800)', background: 'var(--cb-primary-50)', borderRadius: 999, padding: '2px 7px' }}>HEAD OFFICE</span>}
          </div>
        ))}
        {isAdmin && (
          <form onSubmit={addBranch} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="New branch name" style={{ ...inputStyle, marginTop: 0 }} required />
            <button type="submit" style={buttonStyle}>Add</button>
          </form>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Departments</div>
        {departments.map((d) => (
          <div key={d.id} style={{ padding: '6px 0', borderTop: '1px solid var(--cb-border)', fontSize: 13 }}>{d.name}</div>
        ))}
        {isAdmin && (
          <form onSubmit={addDept} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="New department name" style={{ ...inputStyle, marginTop: 0 }} required />
            <button type="submit" style={buttonStyle}>Add</button>
          </form>
        )}
      </div>
      {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, gridColumn: 'span 2' }}>{error}</div>}
    </div>
  );
}

const emptyUserForm = {
  firstName: '', lastName: '', username: '', email: '', phone: '', employeeNumber: '',
  password: '', confirmPassword: '', roleId: '', isActive: true, branchIds: [], departmentIds: [],
};

function UsersTab({ users, roles, branches, departments, isAdmin, onChanged }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyUserForm);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  function toggleId(list, id) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) return setError('Password and confirmation do not match.');
    try {
      await api.createUser(form);
      setForm(emptyUserForm);
      setShowAdd(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdate(u, patch) {
    setError('');
    try {
      await api.updateUser(u.id, patch);
      setEditingUser(null);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    try {
      await api.resetUserPassword(resetTarget.id, newPassword);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>Create, edit, lock, or reset the password for anyone on this company.</div>
        {isAdmin && <button type="button" onClick={() => setShowAdd((v) => !v)} style={buttonStyle}>+ Add user</button>}
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <Field label="First name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
          <Field label="Last name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
          <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field label="Employee number (optional)" value={form.employeeNumber} onChange={(v) => setForm({ ...form, employeeNumber: v })} />
          <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <Field label="Confirm password" type="password" value={form.confirmPassword} onChange={(v) => setForm({ ...form, confirmPassword: v })} />
          <Select label="Assign role" value={form.roleId} onChange={(v) => setForm({ ...form, roleId: Number(v) })} options={roles.map((r) => ({ value: r.id, label: r.name }))} />

          <div style={{ gridColumn: 'span 3' }}>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Branch access</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {branches.map((b) => (
                <label key={b.id} style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={form.branchIds.includes(b.id)} onChange={() => setForm({ ...form, branchIds: toggleId(form.branchIds, b.id) })} />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Department access</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {departments.map((d) => (
                <label key={d.id} style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={form.departmentIds.includes(d.id)} onChange={() => setForm({ ...form, departmentIds: toggleId(form.departmentIds, d.id) })} />
                  {d.name}
                </label>
              ))}
            </div>
          </div>

          {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, gridColumn: 'span 3' }}>{error}</div>}
          <button type="submit" style={{ ...buttonStyle, gridColumn: 'span 1', justifySelf: 'start' }}>Create user</button>
        </form>
      )}

      {resetTarget && (
        <form onSubmit={handleReset} style={{ ...cardStyle, display: 'flex', gap: 10, alignItems: 'end' }}>
          <div style={{ fontSize: 13 }}>Reset password for <strong>{resetTarget.full_name}</strong></div>
          <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} />
          <button type="submit" style={buttonStyle}>Save</button>
          <button type="button" onClick={() => setResetTarget(null)} style={{ ...buttonStyle, background: 'var(--cb-bg)', color: 'var(--cb-text-primary)' }}>Cancel</button>
        </form>
      )}

      {error && !showAdd && !resetTarget && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>
              <th style={thStyle}>Name</th><th style={thStyle}>Email</th><th style={thStyle}>Role</th>
              <th style={thStyle}>Status</th>{isAdmin && <th style={thStyle}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                <td style={tdStyle}>{u.full_name}</td>
                <td style={tdStyle}>{u.email}</td>
                <td style={tdStyle}>
                  {isAdmin ? (
                    <select
                      value={u.role_id}
                      onChange={(e) => handleUpdate(u, { roleId: Number(e.target.value) })}
                      style={{ ...inputStyle, marginTop: 0, padding: '4px 6px', fontSize: 12 }}
                    >
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  ) : u.role_name}
                </td>
                <td style={tdStyle}>
                  <span style={{ color: u.is_active ? 'var(--cb-success)' : 'var(--cb-danger)', fontWeight: 600 }}>
                    {u.is_active ? 'Active' : 'Locked'}
                  </span>
                </td>
                {isAdmin && (
                  <td style={{ ...tdStyle, display: 'flex', gap: 10 }}>
                    <button type="button" onClick={() => handleUpdate(u, { isActive: !u.is_active })} style={linkButtonStyle}>
                      {u.is_active ? 'Lock' : 'Unlock'}
                    </button>
                    <button type="button" onClick={() => setResetTarget(u)} style={linkButtonStyle}>Reset password</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PERMISSION_CATEGORY_ORDER = ['Company', 'Users', 'Accounting', 'Customers', 'Suppliers', 'Banking', 'Inventory', 'Reports', 'Payroll Integration', 'System'];

function RolesTab({ roles, isAdmin }) {
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [checked, setChecked] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.listPermissions().then((r) => setPermissions(r.permissions)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedRoleId) return;
    setSaved(false);
    api.getRolePermissions(selectedRoleId).then((r) => setChecked(r.permissionIds)).catch((err) => setError(err.message));
  }, [selectedRoleId]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const grouped = PERMISSION_CATEGORY_ORDER.map((cat) => ({ cat, items: permissions.filter((p) => p.category === cat) })).filter((g) => g.items.length);

  function toggle(id) {
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  async function save() {
    setError('');
    setSaved(false);
    try {
      await api.setRolePermissions(selectedRoleId, checked);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, maxWidth: 900 }}>
      <div style={cardStyle}>
        {roles.map((r) => (
          <button
            key={r.id} type="button" onClick={() => setSelectedRoleId(r.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 6, marginBottom: 2,
              border: 'none', fontSize: 13, background: selectedRoleId === r.id ? 'var(--cb-primary-50)' : 'transparent',
              color: selectedRoleId === r.id ? 'var(--cb-primary-800)' : 'var(--cb-text-primary)', fontWeight: selectedRoleId === r.id ? 600 : 400,
            }}
          >
            {r.name}
          </button>
        ))}
      </div>

      <div style={cardStyle}>
        {!selectedRole && <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>Select a role to view or edit its permissions.</div>}
        {selectedRole && selectedRole.code === 'super_administrator' && (
          <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>The Super Administrator always has full access — nothing to configure.</div>
        )}
        {selectedRole && selectedRole.code !== 'super_administrator' && (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{selectedRole.name}</div>
            {grouped.map(({ cat, items }) => (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--cb-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{cat}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  {items.map((p) => (
                    <label key={p.id} style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={checked.includes(p.id)} onChange={() => isAdmin && toggle(p.id)} disabled={!isAdmin} />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
            {saved && <div style={{ color: 'var(--cb-success)', fontSize: 13, marginBottom: 8 }}>Saved.</div>}
            {isAdmin && <button type="button" onClick={save} style={buttonStyle}>Save permissions</button>}
          </>
        )}
      </div>
    </div>
  );
}

function AiAssistantTab() {
  const [settings, setSettings] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    api.getAiSettings().then((s) => { setSettings(s); setModel(s.model); }).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      await api.updateAiSettings({ apiKey: apiKey || undefined, model });
      setApiKey('');
      setSaved(true);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveKey() {
    setError('');
    setSaved(false);
    try {
      await api.clearAiSettings();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!settings) return <div style={{ fontSize: 13, color: 'var(--cb-text-secondary)' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>AI Assistant</div>
        <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 14 }}>
          The avatar in the corner of every page can answer detailed questions about how ChronoBooks
          works — it doesn't read this company's actual invoices, balances, or transactions.
          It's free for everyone, powered by a shared OpenAI key, so there's nothing to set up.
          Adding your own key below is entirely optional — do it only if you want this company's
          usage on its own dedicated key instead of the shared one.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: settings.available ? '#e1f5ee' : '#faece7', fontSize: 12.5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: settings.available ? 'var(--cb-success)' : 'var(--cb-danger)' }} />
          <span style={{ fontWeight: 600 }}>{settings.available ? 'Assistant is live — free for everyone' : 'Assistant is not set up yet'}</span>
          <span style={{ color: 'var(--cb-text-secondary)' }}>
            · {settings.hasKey ? 'Using this company’s own key' : settings.usingPlatformKey ? 'Using the free shared key' : 'No key configured anywhere yet'}
          </span>
        </div>

        <form onSubmit={handleSave}>
          <label style={{ ...labelStyle, display: 'block', marginBottom: 12 }}>
            Your own OpenAI API key (optional) {settings.hasKey && <span style={{ color: 'var(--cb-text-secondary)' }}>(currently {settings.maskedKey})</span>}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings.hasKey ? 'Enter a new key to replace it' : 'Leave blank to keep using the free shared assistant'}
              style={inputStyle}
              autoComplete="off"
            />
          </label>

          <Select label="Model" value={model} onChange={setModel} options={settings.supportedModels} />

          {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginTop: 10 }}>{error}</div>}
          {saved && <div style={{ color: 'var(--cb-success)', fontSize: 13, marginTop: 10 }}>Saved.</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Saving…' : 'Save'}</button>
            {settings.hasKey && (
              <button type="button" onClick={handleRemoveKey} style={{ ...buttonStyle, background: 'var(--cb-bg)', color: 'var(--cb-text-primary)', border: '1px solid var(--cb-border)' }}>
                Remove key (go back to the free shared assistant)
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const PARAMETER_SECTIONS = ['Currencies', 'Exchange Rates', 'Tax Codes', 'Cost Centres', 'Payment Terms', 'Number Sequences', 'Document Types'];

function ParametersTab({ isAdmin, isSuperAdmin }) {
  const [section, setSection] = useState('Currencies');
  const [currencies, setCurrencies] = useState([]);
  const [exchangeRates, setExchangeRates] = useState([]);
  const [taxCodes, setTaxCodes] = useState([]);
  const [costCentres, setCostCentres] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [numberSequences, setNumberSequences] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [error, setError] = useState('');

  function load() {
    api.listCurrencies().then((r) => setCurrencies(r.currencies)).catch(() => {});
    api.listExchangeRates().then((r) => setExchangeRates(r.exchangeRates)).catch(() => {});
    api.listTaxCodes().then((r) => setTaxCodes(r.taxCodes)).catch(() => {});
    api.listCostCentres().then((r) => setCostCentres(r.costCentres)).catch(() => {});
    api.listPaymentTerms().then((r) => setPaymentTerms(r.paymentTerms)).catch(() => {});
    api.listNumberSequences().then((r) => setNumberSequences(r.numberSequences)).catch(() => {});
    api.listDocumentTypes().then((r) => setDocumentTypes(r.documentTypes)).catch(() => {});
  }
  useEffect(load, []);

  async function guarded(fn) {
    setError('');
    try { await fn(); load(); } catch (err) { setError(err.message); }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, maxWidth: 900 }}>
      <div style={cardStyle}>
        {PARAMETER_SECTIONS.map((s) => (
          <button
            key={s} type="button" onClick={() => setSection(s)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 6, marginBottom: 2,
              border: 'none', fontSize: 13, background: section === s ? 'var(--cb-primary-50)' : 'transparent',
              color: section === s ? 'var(--cb-primary-800)' : 'var(--cb-text-primary)', fontWeight: section === s ? 600 : 400,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={cardStyle}>
        {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        {section === 'Currencies' && (
          <CurrenciesSection currencies={currencies} isSuperAdmin={isSuperAdmin} onSave={(code, payload) => guarded(() => api.updateCurrency(code, payload))} />
        )}
        {section === 'Exchange Rates' && (
          <ExchangeRatesSection rates={exchangeRates} currencies={currencies} isAdmin={isAdmin} onAdd={(payload) => guarded(() => api.createExchangeRate(payload))} />
        )}
        {section === 'Tax Codes' && (
          <SimpleListSection
            title="Tax codes" isAdmin={isAdmin} rows={taxCodes}
            columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'rate', label: 'Rate (%)' }]}
            fields={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'rate', label: 'Rate (%)', type: 'number' }]}
            onAdd={(payload) => guarded(() => api.createTaxCode(payload))}
          />
        )}
        {section === 'Cost Centres' && (
          <SimpleListSection
            title="Cost centres" isAdmin={isAdmin} rows={costCentres}
            columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }]}
            fields={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }]}
            onAdd={(payload) => guarded(() => api.createCostCentre(payload))}
          />
        )}
        {section === 'Payment Terms' && (
          <SimpleListSection
            title="Payment terms" isAdmin={isAdmin} rows={paymentTerms}
            columns={[{ key: 'name', label: 'Name' }, { key: 'days', label: 'Days' }]}
            fields={[{ key: 'name', label: 'Name' }, { key: 'days', label: 'Days', type: 'number' }]}
            onAdd={(payload) => guarded(() => api.createPaymentTerm(payload))}
          />
        )}
        {section === 'Number Sequences' && (
          <NumberSequencesSection sequences={numberSequences} isAdmin={isAdmin} onSave={(id, payload) => guarded(() => api.updateNumberSequence(id, payload))} />
        )}
        {section === 'Document Types' && (
          <SimpleListSection
            title="Document types" isAdmin={isAdmin} rows={documentTypes}
            columns={[{ key: 'name', label: 'Name' }]}
            fields={[{ key: 'name', label: 'Name' }]}
            onAdd={(payload) => guarded(() => api.createDocumentType(payload))}
          />
        )}
      </div>
    </div>
  );
}

function CurrenciesSection({ currencies, isSuperAdmin, onSave }) {
  const [editingCode, setEditingCode] = useState(null);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Currencies</div>
      <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 12 }}>
        Platform-wide reference list — every company reads the same codes; only a Super Administrator can rename one.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}><th style={thStyle}>Code</th><th style={thStyle}>Name</th><th style={thStyle}>Symbol</th>{isSuperAdmin && <th style={thStyle}>Actions</th>}</tr></thead>
        <tbody>
          {currencies.map((c) => (
            <tr key={c.code} style={{ borderTop: '1px solid var(--cb-border)' }}>
              <td style={tdStyle}>{c.code}</td>
              <td style={tdStyle}>{editingCode === c.code ? <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginTop: 0 }} /> : c.name}</td>
              <td style={tdStyle}>{editingCode === c.code ? <input value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ ...inputStyle, marginTop: 0, width: 60 }} /> : c.symbol}</td>
              {isSuperAdmin && (
                <td style={tdStyle}>
                  {editingCode === c.code ? (
                    <button type="button" onClick={() => { onSave(c.code, { name, symbol }); setEditingCode(null); }} style={linkButtonStyle}>Save</button>
                  ) : (
                    <button type="button" onClick={() => { setEditingCode(c.code); setName(c.name); setSymbol(c.symbol); }} style={linkButtonStyle}>Edit</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExchangeRatesSection({ rates, currencies, isAdmin, onAdd }) {
  const [form, setForm] = useState({ fromCurrency: '', toCurrency: '', rate: '', asOfDate: '' });
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Exchange rates</div>
      {isAdmin && (
        <form onSubmit={(e) => { e.preventDefault(); onAdd({ ...form, rate: Number(form.rate) }); setForm({ fromCurrency: '', toCurrency: '', rate: '', asOfDate: '' }); }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 8, marginBottom: 14, alignItems: 'end' }}>
          <Select label="From" value={form.fromCurrency} onChange={(v) => setForm({ ...form, fromCurrency: v })} options={currencies.map((c) => c.code)} />
          <Select label="To" value={form.toCurrency} onChange={(v) => setForm({ ...form, toCurrency: v })} options={currencies.map((c) => c.code)} />
          <Field label="Rate" type="number" value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} />
          <Field label="As of date" type="date" value={form.asOfDate} onChange={(v) => setForm({ ...form, asOfDate: v })} />
          <button type="submit" style={buttonStyle}>Add</button>
        </form>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}><th style={thStyle}>From</th><th style={thStyle}>To</th><th style={thStyle}>Rate</th><th style={thStyle}>As of</th></tr></thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
              <td style={tdStyle}>{r.from_currency}</td><td style={tdStyle}>{r.to_currency}</td><td style={tdStyle}>{r.rate}</td><td style={tdStyle}>{r.as_of_date}</td>
            </tr>
          ))}
          {rates.length === 0 && <tr><td style={tdStyle} colSpan={4}>No exchange rates recorded yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function NumberSequencesSection({ sequences, isAdmin, onSave }) {
  const [editingId, setEditingId] = useState(null);
  const [prefix, setPrefix] = useState('');
  const [nextNumber, setNextNumber] = useState('');
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Number sequences</div>
      <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 12 }}>Controls the prefix and next number used when a document is created (e.g. INV-0051).</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}><th style={thStyle}>Document</th><th style={thStyle}>Prefix</th><th style={thStyle}>Next number</th>{isAdmin && <th style={thStyle}>Actions</th>}</tr></thead>
        <tbody>
          {sequences.map((s) => (
            <tr key={s.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
              <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{s.document_type}</td>
              <td style={tdStyle}>{editingId === s.id ? <input value={prefix} onChange={(e) => setPrefix(e.target.value)} style={{ ...inputStyle, marginTop: 0, width: 90 }} /> : s.prefix}</td>
              <td style={tdStyle}>{editingId === s.id ? <input type="number" value={nextNumber} onChange={(e) => setNextNumber(e.target.value)} style={{ ...inputStyle, marginTop: 0, width: 70 }} /> : s.next_number}</td>
              {isAdmin && (
                <td style={tdStyle}>
                  {editingId === s.id ? (
                    <button type="button" onClick={() => { onSave(s.id, { prefix, nextNumber: Number(nextNumber) }); setEditingId(null); }} style={linkButtonStyle}>Save</button>
                  ) : (
                    <button type="button" onClick={() => { setEditingId(s.id); setPrefix(s.prefix); setNextNumber(s.next_number); }} style={linkButtonStyle}>Edit</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleListSection({ title, isAdmin, rows, columns, fields, onAdd }) {
  const emptyForm = Object.fromEntries(fields.map((f) => [f.key, '']));
  const [form, setForm] = useState(emptyForm);
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {isAdmin && (
        <form
          onSubmit={(e) => { e.preventDefault(); onAdd(form); setForm(emptyForm); }}
          style={{ display: 'grid', gridTemplateColumns: `repeat(${fields.length}, 1fr) auto`, gap: 8, marginBottom: 14, alignItems: 'end' }}
        >
          {fields.map((f) => (
            <Field key={f.key} label={f.label} type={f.type || 'text'} value={form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} />
          ))}
          <button type="submit" style={buttonStyle}>Add</button>
        </form>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}>{columns.map((c) => <th key={c.key} style={thStyle}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
              {columns.map((c) => <td key={c.key} style={tdStyle}>{r[c.key]}</td>)}
            </tr>
          ))}
          {rows.length === 0 && <tr><td style={tdStyle} colSpan={columns.length}>Nothing here yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SecurityTab({ isAdmin }) {
  const [section, setSection] = useState('Password Policy');
  const [policy, setPolicy] = useState(null);
  const [loginHistory, setLoginHistory] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  function load() {
    api.getPasswordPolicy().then(setPolicy).catch((err) => setError(err.message));
    api.listLoginHistory().then((r) => setLoginHistory(r.entries)).catch(() => {});
    api.listAuditLog().then((r) => setAuditLog(r.entries)).catch(() => {});
  }
  useEffect(load, []);

  async function savePolicy() {
    setError('');
    setSaved(false);
    try {
      await api.updatePasswordPolicy(policy);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, maxWidth: 900 }}>
      <div style={cardStyle}>
        {['Password Policy', 'Login History', 'Audit Log'].map((s) => (
          <button
            key={s} type="button" onClick={() => setSection(s)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 6, marginBottom: 2,
              border: 'none', fontSize: 13, background: section === s ? 'var(--cb-primary-50)' : 'transparent',
              color: section === s ? 'var(--cb-primary-800)' : 'var(--cb-text-primary)', fontWeight: section === s ? 600 : 400,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={cardStyle}>
        {error && <div style={{ color: 'var(--cb-danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        {section === 'Password Policy' && policy && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Password policy</div>
            <div style={{ fontSize: 12, color: 'var(--cb-text-secondary)', marginBottom: 14 }}>
              Applies whenever anyone on this company sets a password — self-service change, admin reset, or new user creation.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 460 }}>
              <Field label="Minimum length" type="number" value={policy.minLength} onChange={(v) => setPolicy({ ...policy, minLength: Number(v) })} disabled={!isAdmin} />
              <div />
              <Toggle label="Require an uppercase letter" checked={policy.requireUppercase} onChange={(v) => setPolicy({ ...policy, requireUppercase: v })} disabled={!isAdmin} />
              <Toggle label="Require a number" checked={policy.requireNumber} onChange={(v) => setPolicy({ ...policy, requireNumber: v })} disabled={!isAdmin} />
              <Toggle label="Require a symbol" checked={policy.requireSymbol} onChange={(v) => setPolicy({ ...policy, requireSymbol: v })} disabled={!isAdmin} />
            </div>
            {saved && <div style={{ color: 'var(--cb-success)', fontSize: 13, marginTop: 10 }}>Saved.</div>}
            {isAdmin && <button type="button" onClick={savePolicy} style={{ ...buttonStyle, marginTop: 14 }}>Save policy</button>}
          </div>
        )}

        {section === 'Login History' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Login history</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}><th style={thStyle}>When</th><th style={thStyle}>Email</th><th style={thStyle}>Result</th><th style={thStyle}>Reason</th><th style={thStyle}>IP address</th></tr></thead>
              <tbody>
                {loginHistory.map((h) => (
                  <tr key={h.id ?? `${h.email}-${h.created_at}`} style={{ borderTop: '1px solid var(--cb-border)' }}>
                    <td style={tdStyle}>{h.created_at}</td>
                    <td style={tdStyle}>{h.email}</td>
                    <td style={tdStyle}><span style={{ color: h.success ? 'var(--cb-success)' : 'var(--cb-danger)', fontWeight: 600 }}>{h.success ? 'Success' : 'Failed'}</span></td>
                    <td style={tdStyle}>{h.reason || '—'}</td>
                    <td style={tdStyle}>{h.ip_address || '—'}</td>
                  </tr>
                ))}
                {loginHistory.length === 0 && <tr><td style={tdStyle} colSpan={5}>No login attempts recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {section === 'Audit Log' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Audit log</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--cb-text-secondary)' }}><th style={thStyle}>When</th><th style={thStyle}>User</th><th style={thStyle}>Action</th><th style={thStyle}>Entity</th></tr></thead>
              <tbody>
                {auditLog.map((a) => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--cb-border)' }}>
                    <td style={tdStyle}>{a.created_at}</td>
                    <td style={tdStyle}>{a.user_name || '—'}</td>
                    <td style={tdStyle}>{a.action}</td>
                    <td style={tdStyle}>{a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ''}</td>
                  </tr>
                ))}
                {auditLog.length === 0 && <tr><td style={tdStyle} colSpan={4}>Nothing recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, color: 'var(--cb-text-secondary)' };
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--cb-border)', borderRadius: 8, fontSize: 14 };
const buttonStyle = { padding: '9px 14px', border: 'none', borderRadius: 8, background: 'var(--cb-primary-400)', color: 'var(--cb-primary-900)', fontWeight: 600, fontSize: 13 };
const thStyle = { padding: '6px 8px', fontWeight: 500 };
const tdStyle = { padding: '8px 8px' };
const cardStyle = { background: 'var(--cb-surface)', border: '1px solid var(--cb-border)', borderRadius: 'var(--cb-radius)', padding: 18, marginBottom: 14 };
const linkButtonStyle = { border: 'none', background: 'transparent', color: 'var(--cb-primary-600)', fontSize: 12, fontWeight: 600, padding: 0 };
