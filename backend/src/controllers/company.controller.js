const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { companyDir } = require('../services/document.service');
const { httpError } = require('../services/approval.service');

// Keep in sync with frontend/src/theme/presets.js — the backend validates against
// the same fixed list so an org can never be saved with an unvetted color.
const BRAND_PRESETS = ['indigo', 'emerald', 'coral', 'rose', 'slate', 'sky', 'forest', 'amber', 'crimson'];

const BOOL_FIELDS = [
  'vatRegistered', 'withholdingTaxEnabled', 'allowNegativeStock', 'multiCurrencyEnabled',
  'costCentresEnabled', 'budgetingEnabled', 'bankReconciliationEnabled', 'inventoryEnabled',
  'fixedAssetsEnabled', 'payrollIntegrationEnabled', 'recurringTransactionsEnabled',
  'approvalRequiredSales', 'approvalRequiredPurchases', 'approvalRequiredReceipts',
  'approvalRequiredExpenses', 'approvalRequiredPayroll',
];

// camelCase (API) <-> snake_case (DB) column map for every editable company field.
const FIELD_MAP = {
  name: 'name',
  tradingName: 'trading_name',
  registrationNumber: 'registration_number',
  tin: 'tin',
  vatNumber: 'vat_number',
  nhilRegistration: 'nhil_registration',
  ssnitEmployerNumber: 'ssnit_employer_number',
  industry: 'industry',
  companyType: 'company_type',
  fiscalYearStartMonth: 'fiscal_year_start_month',
  fiscalYearEndMonth: 'fiscal_year_end_month',
  currency: 'currency',
  reportingCurrency: 'reporting_currency',
  timezone: 'timezone',
  language: 'language',
  phone: 'phone',
  mobile: 'mobile',
  email: 'email',
  website: 'website',
  address: 'address',
  postalAddress: 'postal_address',
  digitalAddress: 'digital_address',
  country: 'country',
  region: 'region',
  city: 'city',
  gpsLocation: 'gps_location',
  logoUrl: 'logo_url',
  stampUrl: 'stamp_url',
  signatureUrl: 'signature_url',
  brandAccentColor: 'brand_accent_color',
  vatRegistered: 'vat_registered',
  vatRate: 'vat_rate',
  nhilRate: 'nhil_rate',
  getfundRate: 'getfund_rate',
  covidLevyRate: 'covid_levy_rate',
  withholdingTaxEnabled: 'withholding_tax_enabled',
  corporateTaxRate: 'corporate_tax_rate',
  defaultTaxMethod: 'default_tax_method',
  accountingMethod: 'accounting_method',
  decimalPlaces: 'decimal_places',
  allowNegativeStock: 'allow_negative_stock',
  multiCurrencyEnabled: 'multi_currency_enabled',
  costCentresEnabled: 'cost_centres_enabled',
  budgetingEnabled: 'budgeting_enabled',
  bankReconciliationEnabled: 'bank_reconciliation_enabled',
  inventoryEnabled: 'inventory_enabled',
  fixedAssetsEnabled: 'fixed_assets_enabled',
  payrollIntegrationEnabled: 'payroll_integration_enabled',
  recurringTransactionsEnabled: 'recurring_transactions_enabled',
  approvalRequiredSales: 'approval_required_sales',
  approvalRequiredPurchases: 'approval_required_purchases',
  approvalRequiredReceipts: 'approval_required_receipts',
  approvalRequiredExpenses: 'approval_required_expenses',
  approvalRequiredPayroll: 'approval_required_payroll',
};

function toApiShape(company) {
  const out = {};
  for (const [apiKey, dbKey] of Object.entries(FIELD_MAP)) {
    let value = company[dbKey];
    if (BOOL_FIELDS.includes(apiKey)) value = !!value;
    out[apiKey] = value;
  }
  out.id = company.id;
  out.setupCompleted = !!company.setup_completed;
  out.selfServe = !!company.self_serve;
  out.hasLogo = !!company.logo_storage_key;
  return out;
}

async function getCompany(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = result.rows[0];
  if (!company) return res.status(404).json({ error: 'Company not found.' });
  res.json(toApiShape(company));
}

/**
 * Company profile — identity, contact, tax configuration, and accounting
 * preferences (write-up Section 1) — Administrator only. Toggle-style preferences
 * (Inventory Enabled, Fixed Assets Enabled, etc.) are stored here as the single
 * source of truth so future modules can read them without their own settings screen.
 */
async function updateCompany(req, res) {
  const { companyId } = req.user;
  const body = req.body || {};

  if (body.brandAccentColor && !BRAND_PRESETS.includes(body.brandAccentColor)) {
    return res.status(400).json({ error: `Unknown brand preset: ${body.brandAccentColor}. Choose from ${BRAND_PRESETS.join(', ')}.` });
  }

  const existing = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const current = existing.rows[0];
  if (!current) return res.status(404).json({ error: 'Company not found.' });

  const setClauses = [];
  const values = [];
  let i = 1;
  for (const [apiKey, dbKey] of Object.entries(FIELD_MAP)) {
    if (!(apiKey in body)) continue;
    let value = body[apiKey];
    if (BOOL_FIELDS.includes(apiKey)) value = value ? '1' : '0';
    setClauses.push(`${dbKey} = $${i}`);
    values.push(value);
    i += 1;
  }

  if (setClauses.length === 0) return res.json({ ok: true });

  values.push(companyId);
  await db.query(`UPDATE companies SET ${setClauses.join(', ')} WHERE id = $${i}`, values);

  res.json({ ok: true });
}

const LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * POST /company/logo — uploads (or replaces) the company's logo. Reuses the same
 * per-company uploads folder as Documents (see document.service.js's companyDir), but
 * is tracked on the companies row itself (logo_storage_key/logo_mime_type) rather than
 * in the documents table, since there's only ever one logo per company, not a list.
 * The old file on disk is removed once the new one's saved so uploads don't pile up.
 */
async function uploadLogo(req, res) {
  const { companyId } = req.user;
  if (!req.file) throw httpError(400, 'No file was uploaded.');
  if (!LOGO_MIME_TYPES.has(req.file.mimetype)) {
    // The shared upload middleware already accepts non-image types (PDFs, Word docs, etc.
    // for Documents) -- narrow it down here since a logo specifically has to be an image.
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'Logo must be a PNG, JPEG, GIF, or WEBP image.' });
  }

  const existing = await db.query(`SELECT logo_storage_key FROM companies WHERE id = $1`, [companyId]);
  const previousKey = existing.rows[0]?.logo_storage_key;

  await db.query(`UPDATE companies SET logo_storage_key = $1, logo_mime_type = $2 WHERE id = $3`, [req.file.filename, req.file.mimetype, companyId]);

  if (previousKey && previousKey !== req.file.filename) {
    fs.promises.unlink(path.join(companyDir(companyId), previousKey)).catch(() => {});
  }

  res.status(201).json({ ok: true });
}

/** GET /company/logo — streams the uploaded logo image. Used both by the Settings preview
 * and by the frontend when building logo-bearing PDFs (fetched once, cached as a data URL). */
async function getLogo(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT logo_storage_key, logo_mime_type FROM companies WHERE id = $1`, [companyId]);
  const company = result.rows[0];
  if (!company?.logo_storage_key) throw httpError(404, 'No logo uploaded yet.');

  const filePath = path.join(companyDir(companyId), company.logo_storage_key);
  res.setHeader('Content-Type', company.logo_mime_type || 'image/png');
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'The logo file is missing from storage.' });
  });
}

/** DELETE /company/logo — removes the logo so invoices/receipts/etc. go back to text-only. */
async function deleteLogo(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT logo_storage_key FROM companies WHERE id = $1`, [companyId]);
  const storageKey = result.rows[0]?.logo_storage_key;

  await db.query(`UPDATE companies SET logo_storage_key = NULL, logo_mime_type = NULL WHERE id = $1`, [companyId]);

  if (storageKey) {
    fs.promises.unlink(path.join(companyDir(companyId), storageKey)).catch(() => {});
  }

  res.json({ ok: true });
}

module.exports = { getCompany, updateCompany, uploadLogo, getLogo, deleteLogo, BRAND_PRESETS };
