const db = require('../config/db');

// Currencies are a platform-wide reference list (currency codes don't vary per
// company) — any authenticated user can read them; only a Super Administrator edits.
async function listCurrencies(req, res) {
  const result = await db.query(`SELECT * FROM currencies ORDER BY code`, []);
  res.json({ currencies: result.rows });
}
async function updateCurrency(req, res) {
  const { code } = req.params;
  const { name, symbol } = req.body;
  const existing = await db.query(`SELECT * FROM currencies WHERE code = $1`, [code]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Currency not found.' });
  await db.query(`UPDATE currencies SET name = $1, symbol = $2 WHERE code = $3`, [name ?? existing.rows[0].name, symbol ?? existing.rows[0].symbol, code]);
  res.json({ ok: true });
}

async function listExchangeRates(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT * FROM exchange_rates WHERE company_id = $1 ORDER BY as_of_date DESC`, [companyId]);
  res.json({ exchangeRates: result.rows });
}
async function createExchangeRate(req, res) {
  const { companyId } = req.user;
  const { fromCurrency, toCurrency, rate, asOfDate } = req.body;
  if (!fromCurrency || !toCurrency || !rate || !asOfDate) return res.status(400).json({ error: 'From/to currency, rate, and date are all required.' });
  const result = await db.query(
    `INSERT INTO exchange_rates (company_id, from_currency, to_currency, rate, as_of_date) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [companyId, fromCurrency, toCurrency, Number(rate), asOfDate]
  );
  res.status(201).json({ id: result.rows[0].id });
}

async function listTaxCodes(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT * FROM tax_codes WHERE company_id = $1 ORDER BY code`, [companyId]);
  res.json({ taxCodes: result.rows });
}
async function createTaxCode(req, res) {
  const { companyId } = req.user;
  const { code, name, rate } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Code and name are required.' });
  const existing = await db.query(`SELECT id FROM tax_codes WHERE company_id = $1 AND code = $2`, [companyId, code]);
  if (existing.rows[0]) return res.status(409).json({ error: `Tax code ${code} already exists.` });
  const result = await db.query(`INSERT INTO tax_codes (company_id, code, name, rate) VALUES ($1,$2,$3,$4) RETURNING id`, [companyId, code, name, Number(rate || 0)]);
  res.status(201).json({ id: result.rows[0].id });
}

async function listCostCentres(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT * FROM cost_centres WHERE company_id = $1 ORDER BY code`, [companyId]);
  res.json({ costCentres: result.rows });
}
async function createCostCentre(req, res) {
  const { companyId } = req.user;
  const { code, name } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Code and name are required.' });
  const existing = await db.query(`SELECT id FROM cost_centres WHERE company_id = $1 AND code = $2`, [companyId, code]);
  if (existing.rows[0]) return res.status(409).json({ error: `Cost centre ${code} already exists.` });
  const result = await db.query(`INSERT INTO cost_centres (company_id, code, name) VALUES ($1,$2,$3) RETURNING id`, [companyId, code, name]);
  res.status(201).json({ id: result.rows[0].id });
}

async function listPaymentTerms(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT * FROM payment_terms WHERE company_id = $1 ORDER BY days`, [companyId]);
  res.json({ paymentTerms: result.rows });
}
async function createPaymentTerm(req, res) {
  const { companyId } = req.user;
  const { name, days } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  const result = await db.query(`INSERT INTO payment_terms (company_id, name, days) VALUES ($1,$2,$3) RETURNING id`, [companyId, name, Number(days || 0)]);
  res.status(201).json({ id: result.rows[0].id });
}

async function listNumberSequences(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT * FROM number_sequences WHERE company_id = $1 ORDER BY document_type`, [companyId]);
  res.json({ numberSequences: result.rows });
}
async function updateNumberSequence(req, res) {
  const { companyId } = req.user;
  const { sequenceId } = req.params;
  const { prefix, nextNumber } = req.body;
  const existing = await db.query(`SELECT * FROM number_sequences WHERE id = $1 AND company_id = $2`, [sequenceId, companyId]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Number sequence not found.' });
  await db.query(`UPDATE number_sequences SET prefix = $1, next_number = $2 WHERE id = $3`, [
    prefix ?? existing.rows[0].prefix, nextNumber ?? existing.rows[0].next_number, sequenceId,
  ]);
  res.json({ ok: true });
}

async function listDocumentTypes(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT * FROM document_types WHERE company_id = $1 ORDER BY name`, [companyId]);
  res.json({ documentTypes: result.rows });
}
async function createDocumentType(req, res) {
  const { companyId } = req.user;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  const result = await db.query(`INSERT INTO document_types (company_id, name) VALUES ($1,$2) RETURNING id`, [companyId, name]);
  res.status(201).json({ id: result.rows[0].id });
}

module.exports = {
  listCurrencies, updateCurrency,
  listExchangeRates, createExchangeRate,
  listTaxCodes, createTaxCode,
  listCostCentres, createCostCentre,
  listPaymentTerms, createPaymentTerm,
  listNumberSequences, updateNumberSequence,
  listDocumentTypes, createDocumentType,
};
