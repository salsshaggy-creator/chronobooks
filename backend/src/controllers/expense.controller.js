const crypto = require('crypto');
const db = require('../config/db');
const { postExpenseJournal } = require('../services/journal.service');
const { httpError, isApprovalRequired, createApprovalRequest } = require('../services/approval.service');
const currencyService = require('../services/currency.service');
const costCentreService = require('../services/costCentre.service');

async function listExpenses(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT e.*, a.name as paid_from_name, cc.code as cost_centre_code, cc.name as cost_centre_name
     FROM expenses e
     JOIN accounts a ON a.id = e.paid_from_account_id
     LEFT JOIN cost_centres cc ON cc.id = e.cost_centre_id
     WHERE e.company_id = $1
     ORDER BY e.expense_date DESC, e.created_at DESC`,
    [companyId]
  );
  res.json({ expenses: result.rows });
}

/**
 * Record Expense (spec Section 7): the user just fills in a plain form —
 * date, category, amount, who it was paid from. The account lookup and the
 * balanced Debit Expense / Credit Bank-or-Cash journal entry happen here,
 * invisibly. Per Diem claims (expenseType 'per_diem') compute their own amount
 * from destination/days/daily rate instead of taking a submitted amount, and post
 * to the "Travel & Per Diem" account regardless of what category was passed in.
 */
async function buildExpense(companyId, userId, body) {
  const { expenseDate, category, paidFromAccountCode, tax, reference, description } = body;
  const expenseType = body.expenseType === 'per_diem' ? 'per_diem' : 'general';

  let amount = Number(body.amount || 0);
  let categoryToUse = category;
  let destination = null;
  let days = null;
  let dailyRate = null;

  if (expenseType === 'per_diem') {
    days = Number(body.days || 0);
    dailyRate = Number(body.dailyRate || 0);
    destination = body.destination || null;
    if (!destination || !days || !dailyRate) throw httpError(400, 'Destination, number of days, and a daily rate are required for a Per Diem claim.');
    amount = Math.round(days * dailyRate * 100) / 100;
    categoryToUse = 'Travel & Per Diem';
  } else if (!expenseDate || !category || !paidFromAccountCode || !amount) {
    throw httpError(400, 'Date, category, paid-from account, and amount are required.');
  }

  if (!expenseDate || !paidFromAccountCode) throw httpError(400, 'Date and paid-from account are required.');

  // Cost Centres: applies to both general and Per Diem expenses.
  const costCentreId = await costCentreService.resolveCostCentreId(companyId, body.costCentreId);

  // Multi-Currency: only plain expenses can be entered in a foreign currency — Per
  // Diem stays in base currency since its amount is already computed server-side from
  // days x daily rate. Same conversion pattern as invoices/bills: the amount posted to
  // the ledger is always base currency; foreignTotal keeps the original for display.
  let isForeign = false;
  let rate = 1;
  let foreignTotal = null;
  if (expenseType === 'general' && body.currency) {
    const companyRes = await db.query(`SELECT currency FROM companies WHERE id = $1`, [companyId]);
    const baseCurrency = companyRes.rows[0]?.currency || 'GHS';
    const resolved = await currencyService.resolveExchangeRate({
      companyId, currency: body.currency, baseCurrency, transactionDate: expenseDate, manualRate: body.exchangeRate,
    });
    rate = resolved.rate;
    isForeign = resolved.isForeign;
    if (isForeign) {
      foreignTotal = currencyService.round2(amount);
      amount = currencyService.round2(amount * rate);
    }
  }

  const expenseAccountRes = await db.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND group_name = $2 LIMIT 1`,
    [companyId, categoryToUse]
  );
  const expenseAccount = expenseAccountRes.rows[0];
  if (!expenseAccount) throw httpError(400, `Unknown expense category: ${categoryToUse}`);

  const paidFromRes = await db.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND code = $2 LIMIT 1`,
    [companyId, paidFromAccountCode]
  );
  const paidFromAccount = paidFromRes.rows[0];
  if (!paidFromAccount) throw httpError(400, `Unknown paid-from account: ${paidFromAccountCode}`);

  const expenseId = crypto.randomUUID();
  const finalDescription = description || (expenseType === 'per_diem' ? `Per Diem — ${destination} (${days} day${days === 1 ? '' : 's'})` : categoryToUse);

  const journalEntryId = await postExpenseJournal({
    companyId,
    expenseAccountId: expenseAccount.id,
    paidFromAccountId: paidFromAccount.id,
    amount,
    tax: Number(tax || 0),
    expenseDate,
    reference,
    description: finalDescription,
    createdBy: userId,
    sourceId: expenseId,
  });

  await db.query(
    `INSERT INTO expenses (id, company_id, expense_date, category, paid_from_account_id, reference, amount, tax, description, status, journal_entry_id, created_by, expense_type, destination, days, daily_rate, currency, exchange_rate, foreign_total, cost_centre_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'posted',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [expenseId, companyId, expenseDate, categoryToUse, expenseAccount.id, reference || null, amount, Number(tax || 0), finalDescription, journalEntryId, userId, expenseType, destination, days, dailyRate, isForeign ? body.currency : null, rate, foreignTotal, costCentreId]
  );

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'create',$4,$5,$6)`,
    [crypto.randomUUID(), companyId, userId, 'expense', expenseId, JSON.stringify({ amount, category: categoryToUse, expenseType })]
  );

  return {
    expenseId, journalEntryId, amount,
    ...(isForeign ? { currency: body.currency, exchangeRate: rate, foreignTotal } : {}),
    ...(costCentreId ? { costCentreId } : {}),
  };
}

function describePerDiemRequest(body) {
  const days = Number(body.days || 0);
  const dailyRate = Number(body.dailyRate || 0);
  return { description: `Per Diem — ${body.destination || 'unspecified destination'} (${days} day${days === 1 ? '' : 's'})`, amount: Math.round(days * dailyRate * 100) / 100 };
}

async function createExpense(req, res) {
  const { companyId, sub: userId } = req.user;
  const expenseType = req.body.expenseType === 'per_diem' ? 'per_diem' : 'general';

  if (expenseType === 'per_diem') {
    if (!req.body.destination || !req.body.days || !req.body.dailyRate || !req.body.expenseDate || !req.body.paidFromAccountCode) {
      return res.status(400).json({ error: 'Date, paid-from account, destination, number of days, and a daily rate are required for a Per Diem claim.' });
    }
    const companyRes = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
    const company = companyRes.rows[0];

    if (isApprovalRequired(company, 'per_diem_expense')) {
      const { description, amount } = describePerDiemRequest(req.body);
      const request = await createApprovalRequest({ companyId, userId, module: 'per_diem_expense', payload: req.body, description, amount, currency: company.currency });
      return res.status(202).json({ pendingApproval: true, approvalRequestId: request.id, message: 'Submitted for approval — the claim will be posted once approved.' });
    }
  } else if (!req.body.expenseDate || !req.body.category || !req.body.paidFromAccountCode || !req.body.amount) {
    return res.status(400).json({ error: 'Date, category, paid-from account, and amount are required.' });
  }

  const result = await buildExpense(companyId, userId, req.body);
  res.status(201).json(result);
}

module.exports = { listExpenses, createExpense, buildExpense, describePerDiemRequest };
