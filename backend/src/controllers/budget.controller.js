const db = require('../config/db');
const { httpError } = require('../services/approval.service');
const budgetService = require('../services/budget.service');

function currentYear() {
  return new Date().getFullYear();
}

/** GET /budgets?year=YYYY — the editable grid: every budgetable account x 12 months. */
async function getBudgets(req, res) {
  const { companyId } = req.user;
  const year = Number(req.query.year) || currentYear();
  const accounts = await budgetService.getBudgetGrid(companyId, year);
  res.json({ year, accounts });
}

/** PUT /budgets — bulk save: { year, entries: [{ accountId, period, amount }, ...] }. */
async function saveBudgets(req, res) {
  const { companyId, sub: userId } = req.user;
  const { entries } = req.body;
  if (!Array.isArray(entries)) throw httpError(400, 'entries must be an array of { accountId, period, amount }.');

  const result = await budgetService.saveBudgets(companyId, userId, entries);

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'update','budget',$4,$5)`,
    [require('crypto').randomUUID(), companyId, userId, null, JSON.stringify({ entriesSaved: result.saved })]
  );

  res.json(result);
}

/** GET /reports/budget-vs-actual?year=YYYY&throughMonth=MM — compares budgeted vs actual for Jan..throughMonth. */
async function getBudgetVsActual(req, res) {
  const { companyId } = req.user;
  const year = Number(req.query.year) || currentYear();
  const throughMonth = Math.min(12, Math.max(1, Number(req.query.throughMonth) || new Date().getMonth() + 1));
  const result = await budgetService.budgetVsActual(companyId, year, throughMonth);
  res.json(result);
}

module.exports = { getBudgets, saveBudgets, getBudgetVsActual };
