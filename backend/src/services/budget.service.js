const crypto = require('crypto');
const db = require('../config/db');
const { httpError } = require('./approval.service');

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function monthPeriod(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Every income/expense account is budgetable — same accounts the P&L already groups by. */
async function listBudgetableAccounts(companyId) {
  const res = await db.query(
    `SELECT id, code, name, type, group_name FROM accounts WHERE company_id = $1 AND type IN ('income','expense') ORDER BY code`,
    [companyId]
  );
  return res.rows;
}

/** GET grid: every budgetable account with its 12 months for the given year (0 where nothing's been set yet). */
async function getBudgetGrid(companyId, year) {
  const accounts = await listBudgetableAccounts(companyId);
  const res = await db.query(
    `SELECT account_id, period, amount FROM budgets WHERE company_id = $1 AND period LIKE $2`,
    [companyId, `${year}-%`]
  );
  const byAccount = {};
  for (const row of res.rows) {
    if (!byAccount[row.account_id]) byAccount[row.account_id] = {};
    byAccount[row.account_id][row.period] = Number(row.amount);
  }

  return accounts.map((a) => {
    const months = {};
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const period = monthPeriod(year, m);
      const amount = (byAccount[a.id] && byAccount[a.id][period]) || 0;
      months[period] = amount;
      total += amount;
    }
    return { accountId: a.id, code: a.code, name: a.name, type: a.type, groupName: a.group_name, months, total: round2(total) };
  });
}

/**
 * Bulk upsert — one call saves an entire year's grid (or just the cells that changed).
 * Manual check-then-insert-or-update since the two DB drivers this app supports
 * (sqlite/postgres) don't share a single portable "upsert" statement.
 */
async function saveBudgets(companyId, userId, entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw httpError(400, 'No budget entries provided.');

  let saved = 0;
  for (const entry of entries) {
    const { accountId, period, amount } = entry;
    if (!accountId || !/^\d{4}-\d{2}$/.test(period || '')) continue;

    const accountRes = await db.query(`SELECT id FROM accounts WHERE id = $1 AND company_id = $2`, [accountId, companyId]);
    if (!accountRes.rows[0]) continue;

    const existing = await db.query(`SELECT id FROM budgets WHERE company_id = $1 AND account_id = $2 AND period = $3`, [companyId, accountId, period]);
    if (existing.rows[0]) {
      await db.query(`UPDATE budgets SET amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [round2(amount || 0), existing.rows[0].id]);
    } else {
      await db.query(
        `INSERT INTO budgets (id, company_id, account_id, period, amount, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [crypto.randomUUID(), companyId, accountId, period, round2(amount || 0), userId]
      );
    }
    saved += 1;
  }

  return { saved };
}

/**
 * Budget vs Actual: for each budgetable account, sum the budgeted amount for
 * Jan..throughMonth of `year` against what actually posted through journal_lines in
 * that same window — the exact same ledger every report reads from. "Favorable" means
 * the business is doing better than planned: for income that's actual >= budget, for
 * expense it's actual <= budget.
 */
async function budgetVsActual(companyId, year, throughMonth) {
  const accounts = await listBudgetableAccounts(companyId);
  const fromDate = `${year}-01-01`;
  const lastDayOfMonth = new Date(year, throughMonth, 0).getDate(); // day 0 of next month = last day of this one
  const toDate = `${year}-${String(throughMonth).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
  const periodPrefix = `${year}-`;
  const periods = [];
  for (let m = 1; m <= throughMonth; m++) periods.push(monthPeriod(year, m));

  // The date filter has to live inside the SUM (not on the journal_entries JOIN's ON
  // clause) — a LEFT JOIN with a date condition in its ON clause still preserves the
  // journal_lines row (with NULLed-out je.* columns) when the date doesn't match, which
  // would silently include out-of-range activity in the total. CASE-gating each line
  // keeps that from happening while still returning every account (even ones with zero
  // activity) thanks to the outer LEFT JOINs and COALESCE.
  const actualRes = await db.query(
    `SELECT a.id as account_id,
            COALESCE(SUM(CASE WHEN je.entry_date >= $2 AND je.entry_date <= $3 THEN jl.debit ELSE 0 END),0) as debit,
            COALESCE(SUM(CASE WHEN je.entry_date >= $2 AND je.entry_date <= $3 THEN jl.credit ELSE 0 END),0) as credit
     FROM accounts a
     LEFT JOIN journal_lines jl ON jl.account_id = a.id
     LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE a.company_id = $1 AND a.type IN ('income','expense')
     GROUP BY a.id`,
    [companyId, fromDate, toDate]
  );
  const actualByAccount = {};
  for (const row of actualRes.rows) actualByAccount[row.account_id] = { debit: Number(row.debit), credit: Number(row.credit) };

  const budgetRes = await db.query(
    `SELECT account_id, SUM(amount) as total FROM budgets WHERE company_id = $1 AND period LIKE $2 AND period IN (${periods.map((_, i) => `$${i + 3}`).join(',')}) GROUP BY account_id`,
    [companyId, `${periodPrefix}%`, ...periods]
  );
  const budgetByAccount = {};
  for (const row of budgetRes.rows) budgetByAccount[row.account_id] = Number(row.total);

  const income = [];
  const expenses = [];
  for (const a of accounts) {
    const actualLines = actualByAccount[a.id] || { debit: 0, credit: 0 };
    const budget = round2(budgetByAccount[a.id] || 0);
    const actual = a.type === 'income' ? round2(actualLines.credit - actualLines.debit) : round2(actualLines.debit - actualLines.credit);
    if (budget === 0 && actual === 0) continue;
    const variance = round2(actual - budget);
    const favorable = a.type === 'income' ? actual >= budget : actual <= budget;
    const row = { label: a.name, groupName: a.group_name, budget, actual, variance, favorable };
    if (a.type === 'income') income.push(row); else expenses.push(row);
  }

  const totalBudgetIncome = round2(income.reduce((s, r) => s + r.budget, 0));
  const totalActualIncome = round2(income.reduce((s, r) => s + r.actual, 0));
  const totalBudgetExpenses = round2(expenses.reduce((s, r) => s + r.budget, 0));
  const totalActualExpenses = round2(expenses.reduce((s, r) => s + r.actual, 0));

  return {
    year, throughMonth, income, expenses,
    totalBudgetIncome, totalActualIncome, totalBudgetExpenses, totalActualExpenses,
    netBudget: round2(totalBudgetIncome - totalBudgetExpenses),
    netActual: round2(totalActualIncome - totalActualExpenses),
  };
}

module.exports = { listBudgetableAccounts, getBudgetGrid, saveBudgets, budgetVsActual, round2 };
