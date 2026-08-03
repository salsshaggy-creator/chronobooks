const crypto = require('crypto');
const db = require('../config/db');

const MODULE_FIELDS = [
  ['inventoryEnabled', 'inventory_enabled', 'Inventory', 'Stock tracking, receipts, and issues.'],
  ['fixedAssetsEnabled', 'fixed_assets_enabled', 'Fixed Assets', 'Asset registration and depreciation.'],
  ['budgetingEnabled', 'budgeting_enabled', 'Budgeting', 'Budgets vs actuals.'],
  ['procurementEnabled', 'procurement_enabled', 'Procurement', 'Purchase orders and requisitions.'],
  ['manufacturingEnabled', 'manufacturing_enabled', 'Manufacturing', 'Bills of materials and production runs.'],
  ['posEnabled', 'pos_enabled', 'Point of Sale', 'Till-based retail sales.'],
  ['multiCurrencyEnabled', 'multi_currency_enabled', 'Multi-Currency', 'Transact and report in more than one currency.'],
  ['consolidationEnabled', 'consolidation_enabled', 'Consolidation', 'Combined reporting across companies.'],
];

function generateLicenseKey() {
  const raw = crypto.randomBytes(10).toString('hex').toUpperCase();
  return raw.match(/.{1,4}/g).join('-');
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function licenseStatus(company) {
  if (!company.license_expires_at) return { status: 'active', daysLeft: null };
  const now = new Date();
  const expires = new Date(company.license_expires_at);
  const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
  if (daysLeft > 0) return { status: company.license_type === 'demo' ? 'trial' : 'active', daysLeft };
  if (daysLeft >= -30) return { status: 'grace_period', daysLeft };
  return { status: 'expired', daysLeft };
}

function toModuleShape(company) {
  const modules = {};
  for (const [apiKey, dbKey] of MODULE_FIELDS) modules[apiKey] = !!company[dbKey];
  return modules;
}

async function seatUsage(companyId) {
  const res = await db.query(
    `SELECT COUNT(*) as cnt FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.company_id = $1 AND u.is_active = 1 AND r.code != 'super_administrator'`,
    [companyId]
  );
  return Number(res.rows[0].cnt) || 0;
}

/** The current company's own license — any authenticated user can view it (read-only unless Administrator). */
async function getMyLicense(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = result.rows[0];
  if (!company) return res.status(404).json({ error: 'Company not found.' });

  const used = await seatUsage(companyId);
  const { status, daysLeft } = licenseStatus(company);

  res.json({
    licenseType: company.license_type,
    planName: company.plan_name,
    userLimit: company.user_limit,
    usersActive: used,
    licenseKey: company.license_key,
    customerRef: company.customer_ref,
    activatedAt: company.license_activated_at,
    expiresAt: company.license_expires_at,
    lastRenewedAt: company.license_last_renewed_at,
    aiAssistantAllowance: company.ai_assistant_allowance,
    status,
    daysLeft,
    modules: toModuleShape(company),
  });
}

async function listPricingTiers(req, res) {
  const result = await db.query(`SELECT * FROM pricing_tiers ORDER BY sort_order`, []);
  res.json({ tiers: result.rows });
}
async function listPricingAddons(req, res) {
  const result = await db.query(`SELECT * FROM pricing_addons ORDER BY sort_order`, []);
  res.json({ addons: result.rows });
}

/** Super Administrator can edit the platform's own pricing tiers/addons directly (the pencil-icon rows). */
async function updatePricingTier(req, res) {
  const { tierId } = req.params;
  const { planName, companiesIncluded, usersIncluded, annualFee } = req.body;
  const existing = await db.query(`SELECT * FROM pricing_tiers WHERE id = $1`, [tierId]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Pricing tier not found.' });
  const t = existing.rows[0];
  await db.query(`UPDATE pricing_tiers SET plan_name=$1, companies_included=$2, users_included=$3, annual_fee=$4 WHERE id=$5`, [
    planName ?? t.plan_name, companiesIncluded ?? t.companies_included, usersIncluded ?? t.users_included, annualFee ?? t.annual_fee, tierId,
  ]);
  res.json({ ok: true });
}
async function updatePricingAddon(req, res) {
  const { addonId } = req.params;
  const { label, annualFee } = req.body;
  const existing = await db.query(`SELECT * FROM pricing_addons WHERE id = $1`, [addonId]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Add-on not found.' });
  const a = existing.rows[0];
  await db.query(`UPDATE pricing_addons SET label=$1, annual_fee=$2 WHERE id=$3`, [label ?? a.label, annualFee ?? a.annual_fee, addonId]);
  res.json({ ok: true });
}

/** Super Administrator: view any customer company's current license (populates the generator's "current package" side). */
async function getCompanyLicense(req, res) {
  const { companyId } = req.params;
  const result = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = result.rows[0];
  if (!company) return res.status(404).json({ error: 'Company not found.' });
  const used = await seatUsage(companyId);
  const { status, daysLeft } = licenseStatus(company);
  res.json({
    licenseType: company.license_type, planName: company.plan_name, userLimit: company.user_limit,
    usersActive: used, licenseKey: company.license_key, expiresAt: company.license_expires_at,
    status, daysLeft, modules: toModuleShape(company),
  });
}

/**
 * Issue or update a license for any customer company (write-up: Super Admin "assigns
 * licenses... enables/disables modules"). Re-generating always issues a fresh license
 * key and activation date; if the company already had an expiry date, that becomes the
 * new "last renewed" marker so renewal history is visible in the company-admin view.
 */
async function generateLicense(req, res) {
  const { companyId, licenseType, planName, userLimit, expiryYears, modules, aiAssistantAllowance } = req.body;
  if (!companyId || !licenseType || !planName || !userLimit || !expiryYears) {
    return res.status(400).json({ error: 'companyId, licenseType, planName, userLimit, and expiryYears are required.' });
  }

  const existing = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = existing.rows[0];
  if (!company) return res.status(404).json({ error: 'Company not found.' });

  const today = new Date().toISOString().slice(0, 10);
  const expiresAt = addYears(today, Number(expiryYears));
  const lastRenewedAt = company.license_expires_at || null;
  const licenseKey = generateLicenseKey();
  const customerRef = company.customer_ref || `CUST-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const moduleSets = [];
  const moduleValues = [];
  let i = 1;
  for (const [apiKey, dbKey] of MODULE_FIELDS) {
    if (modules && apiKey in modules) {
      moduleSets.push(`${dbKey} = $${i}`);
      moduleValues.push(modules[apiKey] ? 1 : 0);
      i += 1;
    }
  }

  const baseSets = [
    `license_type = $${i}`, `plan_name = $${i + 1}`, `user_limit = $${i + 2}`, `license_key = $${i + 3}`,
    `customer_ref = $${i + 4}`, `license_activated_at = $${i + 5}`, `license_expires_at = $${i + 6}`,
    `license_last_renewed_at = $${i + 7}`, `ai_assistant_allowance = $${i + 8}`,
  ];
  const baseValues = [licenseType, planName, Number(userLimit), licenseKey, customerRef, today, expiresAt, lastRenewedAt, aiAssistantAllowance || 'none'];

  await db.query(
    `UPDATE companies SET ${[...moduleSets, ...baseSets].join(', ')} WHERE id = $${i + 9}`,
    [...moduleValues, ...baseValues, companyId]
  );

  res.json({ ok: true, licenseKey, activatedAt: today, expiresAt });
}

/**
 * Danger zone — permanently delete a company. Every child table (users, accounts,
 * journal entries, invoices, bills, etc.) cascades via ON DELETE CASCADE, so this one
 * DELETE genuinely removes the whole company, matching the write-up's warning.
 */
async function deleteCompany(req, res) {
  const { companyId } = req.params;
  const { confirmName } = req.body;

  const existing = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = existing.rows[0];
  if (!company) return res.status(404).json({ error: 'Company not found.' });
  if (confirmName !== company.name) {
    return res.status(400).json({ error: 'Company name confirmation does not match.' });
  }

  await db.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
  res.json({ ok: true });
}

module.exports = {
  getMyLicense, listPricingTiers, listPricingAddons, updatePricingTier, updatePricingAddon,
  getCompanyLicense, generateLicense, deleteCompany,
};
