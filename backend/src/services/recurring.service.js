const crypto = require('crypto');
const db = require('../config/db');
const { httpError } = require('./approval.service');

const TYPES = ['invoice', 'bill', 'expense'];
const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Adds `months` to a YYYY-MM-DD date, clamping to the last day of the target month if
 * the original day doesn't exist there (Jan 31 + 1 month = Feb 28, not Mar 3). */
function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetIndex = (m - 1) + months;
  const targetYear = y + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDayOfTargetMonth);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextOccurrence(dateStr, frequency) {
  if (frequency === 'weekly') return addDays(dateStr, 7);
  if (frequency === 'monthly') return addMonths(dateStr, 1);
  if (frequency === 'quarterly') return addMonths(dateStr, 3);
  if (frequency === 'yearly') return addMonths(dateStr, 12);
  throw httpError(400, `Unknown frequency: ${frequency}`);
}

/** Same subtotal/tax math every buildX function does, used purely for a preview amount — never posted. */
function previewAmount(type, payload) {
  if (type === 'expense') {
    return round2(Number(payload.amount || 0) + Number(payload.tax || 0));
  }
  const subtotal = (payload.lines || []).reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const tax = round2(subtotal * (Number(payload.taxRatePercent || 0) / 100));
  return round2(subtotal + tax);
}

function validateCreatePayload(type, name, frequency, startDate, payload) {
  if (!TYPES.includes(type)) throw httpError(400, `Type must be one of: ${TYPES.join(', ')}.`);
  if (!name) throw httpError(400, 'A name is required (e.g. "Monthly office rent").');
  if (!FREQUENCIES.includes(frequency)) throw httpError(400, `Frequency must be one of: ${FREQUENCIES.join(', ')}.`);
  if (!startDate) throw httpError(400, 'A start date is required.');
  if (!payload || typeof payload !== 'object') throw httpError(400, 'A payload describing the transaction is required.');
  if (type === 'invoice' && (!payload.customerId || !Array.isArray(payload.lines) || payload.lines.length === 0)) {
    throw httpError(400, 'A customer and at least one line item are required.');
  }
  if (type === 'bill') {
    if (!payload.supplierId || !Array.isArray(payload.lines) || payload.lines.length === 0) {
      throw httpError(400, 'A supplier and at least one line item are required.');
    }
    if ((payload.expenseCategory || '') === 'Inventory') {
      throw httpError(400, 'Recurring bills can\'t receive stock (category "Inventory") — set up a recurring bill under a different category, and receive that stock manually.');
    }
  }
  if (type === 'expense' && (!payload.category || !payload.paidFromAccountCode || !payload.amount)) {
    throw httpError(400, 'Category, paid-from account, and amount are required.');
  }
}

async function createRecurring(companyId, userId, body) {
  const { type, name, frequency, startDate, endDate, dueDays, payload } = body;
  validateCreatePayload(type, name, frequency, startDate, payload);
  if (endDate && endDate < startDate) throw httpError(400, 'End date can\'t be before the start date.');

  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO recurring_transactions (id, company_id, type, name, payload, frequency, due_days, start_date, next_run_date, end_date, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)`,
    [id, companyId, type, name, JSON.stringify(payload), frequency, dueDays != null ? Number(dueDays) : null, startDate, startDate, endDate || null, userId]
  );
  return { id };
}

async function updateRecurring(companyId, id, body) {
  const existing = await db.query(`SELECT * FROM recurring_transactions WHERE id = $1 AND company_id = $2`, [id, companyId]);
  const row = existing.rows[0];
  if (!row) throw httpError(404, 'Recurring transaction not found.');

  const name = body.name ?? row.name;
  const frequency = body.frequency ?? row.frequency;
  if (!FREQUENCIES.includes(frequency)) throw httpError(400, `Frequency must be one of: ${FREQUENCIES.join(', ')}.`);
  const endDate = 'endDate' in body ? (body.endDate || null) : row.end_date;
  const dueDays = 'dueDays' in body ? (body.dueDays != null ? Number(body.dueDays) : null) : row.due_days;
  const payload = body.payload ? JSON.stringify(body.payload) : row.payload;
  const isActive = 'isActive' in body ? (body.isActive ? '1' : '0') : row.is_active;

  await db.query(
    `UPDATE recurring_transactions SET name = $1, frequency = $2, end_date = $3, due_days = $4, payload = $5, is_active = $6 WHERE id = $7`,
    [name, frequency, endDate, dueDays, payload, isActive, id]
  );
  return { ok: true };
}

async function listRecurring(companyId) {
  const res = await db.query(`SELECT * FROM recurring_transactions WHERE company_id = $1 ORDER BY next_run_date ASC`, [companyId]);
  const rows = [];
  for (const r of res.rows) {
    const payload = JSON.parse(r.payload);
    let subject = null;
    if (r.type === 'invoice' && payload.customerId) {
      const c = await db.query(`SELECT name FROM customers WHERE id = $1 AND company_id = $2`, [payload.customerId, companyId]);
      subject = c.rows[0]?.name || null;
    } else if (r.type === 'bill' && payload.supplierId) {
      const s = await db.query(`SELECT name FROM suppliers WHERE id = $1 AND company_id = $2`, [payload.supplierId, companyId]);
      subject = s.rows[0]?.name || null;
    }
    rows.push({
      id: r.id, type: r.type, name: r.name, subject, payload, frequency: r.frequency, dueDays: r.due_days,
      startDate: r.start_date, nextRunDate: r.next_run_date, endDate: r.end_date, isActive: !!r.is_active,
      lastRunDate: r.last_run_date, occurrencesPosted: r.occurrences_posted, amount: previewAmount(r.type, payload),
    });
  }
  return rows;
}

function buildOccurrenceBody(type, payload, occurrenceDate, dueDays) {
  if (type === 'invoice') return { ...payload, invoiceDate: occurrenceDate, dueDate: dueDays != null ? addDays(occurrenceDate, dueDays) : undefined };
  if (type === 'bill') return { ...payload, billDate: occurrenceDate, dueDate: dueDays != null ? addDays(occurrenceDate, dueDays) : undefined };
  return { ...payload, expenseType: 'general', expenseDate: occurrenceDate };
}

/**
 * Posts every occurrence a recurring transaction owes, up through asOfDate — catching up
 * on more than one period at once if it's been a while (e.g. three unpaid months of rent
 * posts three separate invoices). Each occurrence calls the exact same buildInvoice/
 * buildBill/buildExpense function a direct create would, so a recurring transaction can
 * never post anything a manual one couldn't. Capped at 60 occurrences per rule per run as
 * a safety net against a runaway loop.
 */
async function runDue(companyId, userId, asOfDate) {
  // Required late (not at module load) to avoid a circular require: those controllers
  // don't depend on this service, but requiring at the top of this file executes before
  // routes/index.js has finished wiring everything up.
  const { buildInvoice } = require('../controllers/invoice.controller');
  const { buildBill } = require('../controllers/bill.controller');
  const { buildExpense } = require('../controllers/expense.controller');

  const res = await db.query(
    `SELECT * FROM recurring_transactions WHERE company_id = $1 AND is_active = true AND next_run_date <= $2 ORDER BY next_run_date ASC`,
    [companyId, asOfDate]
  );

  const processed = [];
  let totalOccurrencesPosted = 0;

  for (const row of res.rows) {
    const payload = JSON.parse(row.payload);
    let nextRunDate = row.next_run_date;
    let occurrencesPosted = 0;
    const results = [];

    while (nextRunDate <= asOfDate && (!row.end_date || nextRunDate <= row.end_date) && occurrencesPosted < 60) {
      const occurrenceBody = buildOccurrenceBody(row.type, payload, nextRunDate, row.due_days);
      let result;
      if (row.type === 'invoice') result = await buildInvoice(companyId, userId, occurrenceBody);
      else if (row.type === 'bill') result = await buildBill(companyId, userId, occurrenceBody);
      else result = await buildExpense(companyId, userId, occurrenceBody);

      const resultId = result.invoiceId || result.billId || result.expenseId;
      const amount = result.total ?? result.amount;
      await db.query(
        `INSERT INTO recurring_transaction_runs (id, recurring_transaction_id, run_date, result_type, result_id, amount) VALUES ($1,$2,$3,$4,$5,$6)`,
        [crypto.randomUUID(), row.id, nextRunDate, row.type, resultId, amount]
      );
      results.push({ date: nextRunDate, type: row.type, resultId, amount });

      occurrencesPosted += 1;
      nextRunDate = nextOccurrence(nextRunDate, row.frequency);
    }

    if (occurrencesPosted > 0) {
      const stillActive = !row.end_date || nextRunDate <= row.end_date;
      await db.query(
        `UPDATE recurring_transactions SET next_run_date = $1, last_run_date = $2, occurrences_posted = occurrences_posted + $3, is_active = $4 WHERE id = $5`,
        [nextRunDate, results[results.length - 1].date, occurrencesPosted, stillActive ? '1' : '0', row.id]
      );
      processed.push({ recurringTransactionId: row.id, name: row.name, type: row.type, occurrencesPosted, results });
      totalOccurrencesPosted += occurrencesPosted;
    }
  }

  return { asOfDate, processed, totalOccurrencesPosted };
}

async function listRuns(companyId, recurringTransactionId) {
  const owner = await db.query(`SELECT id FROM recurring_transactions WHERE id = $1 AND company_id = $2`, [recurringTransactionId, companyId]);
  if (!owner.rows[0]) throw httpError(404, 'Recurring transaction not found.');
  const res = await db.query(
    `SELECT * FROM recurring_transaction_runs WHERE recurring_transaction_id = $1 ORDER BY run_date DESC, created_at DESC`,
    [recurringTransactionId]
  );
  return res.rows;
}

module.exports = { createRecurring, updateRecurring, listRecurring, runDue, listRuns, nextOccurrence };
