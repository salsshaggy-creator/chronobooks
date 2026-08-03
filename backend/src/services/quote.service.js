const crypto = require('crypto');
const db = require('../config/db');
const { httpError } = require('./approval.service');
const costCentreService = require('./costCentre.service');

const EDITABLE_STATUSES = ['draft', 'sent', 'accepted', 'declined'];
const CONVERTIBLE_STATUSES = ['sent', 'accepted'];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

async function nextQuoteNumber(companyId) {
  const res = await db.query(`SELECT COUNT(*) as count FROM quotes WHERE company_id = $1`, [companyId]);
  const n = Number(res.rows[0].count) + 1;
  return `QUO-${String(n).padStart(4, '0')}`;
}

async function listQuotes(companyId) {
  const res = await db.query(
    `SELECT q.*, c.name as customer_name, i.invoice_number as converted_invoice_number,
            cc.code as cost_centre_code, cc.name as cost_centre_name
     FROM quotes q
     JOIN customers c ON c.id = q.customer_id
     LEFT JOIN invoices i ON i.id = q.converted_invoice_id
     LEFT JOIN cost_centres cc ON cc.id = q.cost_centre_id
     WHERE q.company_id = $1
     ORDER BY q.quote_date DESC, q.created_at DESC`,
    [companyId]
  );
  return res.rows.map((r) => ({
    ...r,
    isExpired: !!r.expiry_date && r.expiry_date < today() && !['accepted', 'declined', 'converted'].includes(r.status),
  }));
}

async function getQuoteWithLines(companyId, quoteId) {
  const quoteRes = await db.query(`SELECT * FROM quotes WHERE id = $1 AND company_id = $2`, [quoteId, companyId]);
  const quote = quoteRes.rows[0];
  if (!quote) return null;
  const linesRes = await db.query(`SELECT * FROM quote_lines WHERE quote_id = $1`, [quoteId]);
  return { ...quote, lines: linesRes.rows };
}

async function createQuote(companyId, userId, body) {
  const { customerId, quoteDate, expiryDate, incomeCategory, taxRatePercent, lines, currency, costCentreId, notes } = body;
  if (!customerId || !quoteDate || !Array.isArray(lines) || lines.length === 0) {
    throw httpError(400, 'Customer, quote date, and at least one line item are required.');
  }
  const resolvedCostCentreId = await costCentreService.resolveCostCentreId(companyId, costCentreId);

  const subtotal = round2(lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0));
  const tax = round2(subtotal * (Number(taxRatePercent || 0) / 100));
  const total = round2(subtotal + tax);

  const quoteId = crypto.randomUUID();
  const quoteNumber = await nextQuoteNumber(companyId);

  await db.query(
    `INSERT INTO quotes (id, company_id, customer_id, quote_number, quote_date, expiry_date, income_category, tax_rate_percent, subtotal, tax, total, status, notes, currency, cost_centre_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,$13,$14,$15)`,
    [quoteId, companyId, customerId, quoteNumber, quoteDate, expiryDate || null, incomeCategory || 'Sales', Number(taxRatePercent || 0), subtotal, tax, total, notes || null, currency || null, resolvedCostCentreId, userId]
  );

  for (const line of lines) {
    await db.query(
      `INSERT INTO quote_lines (id, quote_id, description, quantity, unit_price, line_total, item_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [crypto.randomUUID(), quoteId, line.description, Number(line.quantity), Number(line.unitPrice), round2(Number(line.quantity) * Number(line.unitPrice)), line.itemId || null]
    );
  }

  return { quoteId, quoteNumber, total };
}

async function updateQuoteStatus(companyId, quoteId, status) {
  const quote = await getQuoteWithLines(companyId, quoteId);
  if (!quote) throw httpError(404, 'Quote not found.');
  if (quote.status === 'converted') throw httpError(400, 'A converted quote can\'t be changed.');
  if (!EDITABLE_STATUSES.includes(status)) throw httpError(400, `Status must be one of: ${EDITABLE_STATUSES.join(', ')}.`);

  await db.query(`UPDATE quotes SET status = $1 WHERE id = $2`, [status, quoteId]);
  return { ok: true, status };
}

/**
 * Converts a sent or accepted quote into a real Sales invoice by calling buildInvoice —
 * the exact same posting logic (ledger entry, Cost Centre tag, Multi-Currency conversion,
 * Inventory issue + Cost of Goods Sold) a direct invoice creation uses. The quote is
 * locked to 'converted' and linked to the new invoice; it can never be converted twice.
 */
async function convertQuote(companyId, userId, quoteId) {
  const { buildInvoice } = require('../controllers/invoice.controller');

  const quote = await getQuoteWithLines(companyId, quoteId);
  if (!quote) throw httpError(404, 'Quote not found.');
  if (quote.status === 'converted') throw httpError(400, 'This quote has already been converted to an invoice.');
  if (!CONVERTIBLE_STATUSES.includes(quote.status)) {
    throw httpError(400, 'Only a quote marked "sent" or "accepted" can be converted to an invoice.');
  }

  const body = {
    customerId: quote.customer_id,
    invoiceDate: today(),
    incomeCategory: quote.income_category,
    taxRatePercent: quote.tax_rate_percent,
    lines: quote.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unit_price, itemId: l.item_id || undefined })),
    ...(quote.currency ? { currency: quote.currency } : {}),
    ...(quote.cost_centre_id ? { costCentreId: quote.cost_centre_id } : {}),
  };

  const result = await buildInvoice(companyId, userId, body);

  await db.query(`UPDATE quotes SET status = 'converted', converted_invoice_id = $1 WHERE id = $2`, [result.invoiceId, quoteId]);

  return { invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber, total: result.total };
}

module.exports = { listQuotes, createQuote, updateQuoteStatus, convertQuote, getQuoteWithLines };
