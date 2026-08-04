const db = require('../config/db');

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
    if (BOOL_FIELDS.includes(apiKey)) value = value ? 1 : 0;
    setClauses.push(`${dbKey} = $${i}`);
    values.push(value);
    i += 1;
  }

  if (setClauses.length === 0) return res.json({ ok: true });

  values.push(companyId);
  await db.query(`UPDATE companies SET ${setClauses.join(', ')} WHERE id = $${i}`, values);

  res.json({ ok: true });
}

module.exports = { getCompany, updateCompany, BRAND_PRESETS };
