const db = require('../config/db');

/**
 * Sum of all journal movement for accounts in a given group. Opening balances are
 * posted as real journal entries (see seed.js / spec Section 3.2), so this reads
 * purely off journal_lines — no separate "opening balance" number to keep in sync.
 */
async function balanceForGroup(companyId, groupName) {
  const accountsRes = await db.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND group_name = $2`,
    [companyId, groupName]
  );
  const accountIds = accountsRes.rows.map((r) => r.id);
  if (accountIds.length === 0) return 0;

  const placeholders = accountIds.map((_, i) => `$${i + 2}`).join(',');
  const movementRes = await db.query(
    `SELECT COALESCE(SUM(jl.debit),0) as debit, COALESCE(SUM(jl.credit),0) as credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.company_id = $1 AND jl.account_id IN (${placeholders})`,
    [companyId, ...accountIds]
  );
  const debit = Number(movementRes.rows[0]?.debit) || 0;
  const credit = Number(movementRes.rows[0]?.credit) || 0;
  return debit - credit; // asset accounts: debit increases balance
}

// Expense-type accounts increase on the debit side. Reading this off the ledger
// (rather than just the expenses table) means it automatically includes Bills too,
// and Payroll once that lands, without the dashboard needing to know about every
// module that can create an expense.
async function expensesThisMonth(companyId) {
  const startOfMonth = db.dialect === 'sqlite'
    ? `date('now','start of month')`
    : `date_trunc('month', CURRENT_DATE)`;
  const res = await db.query(
    `SELECT COALESCE(SUM(jl.debit - jl.credit),0) as total
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE je.company_id = $1 AND a.type = 'expense' AND je.entry_date >= ${startOfMonth}`,
    [companyId]
  );
  return Number(res.rows[0].total) || 0;
}

async function outstandingSuppliers(companyId) {
  const res = await db.query(
    `SELECT COALESCE(SUM(total - paid),0) as total FROM bills WHERE company_id = $1 AND status != 'void'`,
    [companyId]
  );
  return Number(res.rows[0].total) || 0;
}

async function incomeThisMonth(companyId) {
  const startOfMonth = db.dialect === 'sqlite'
    ? `date('now','start of month')`
    : `date_trunc('month', CURRENT_DATE)`;
  // Income accounts increase on the credit side, so credit - debit for the period.
  const res = await db.query(
    `SELECT COALESCE(SUM(jl.credit - jl.debit),0) as total
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE je.company_id = $1 AND a.type = 'income' AND je.entry_date >= ${startOfMonth}`,
    [companyId]
  );
  return Number(res.rows[0].total) || 0;
}

async function outstandingCustomers(companyId) {
  const res = await db.query(
    `SELECT COALESCE(SUM(total - paid),0) as total FROM invoices WHERE company_id = $1 AND status != 'void'`,
    [companyId]
  );
  return Number(res.rows[0].total) || 0;
}

async function recentTransactions(companyId, limit = 8) {
  const res = await db.query(
    `SELECT je.id, je.entry_date, je.description, je.source_type,
            (SELECT COALESCE(SUM(debit),0) FROM journal_lines WHERE journal_entry_id = je.id) as total
     FROM journal_entries je
     WHERE je.company_id = $1
     ORDER BY je.entry_date DESC, je.created_at DESC
     LIMIT $2`,
    [companyId, limit]
  );
  return res.rows;
}

// Last N months of income vs expense, bucketed by calendar month, read straight off
// the ledger. Powers the Dashboard's cash flow chart — real numbers, not a mock series.
async function monthlyTrend(companyId, months = 6) {
  const monthExpr = db.dialect === 'sqlite'
    ? `strftime('%Y-%m', je.entry_date)`
    : `to_char(je.entry_date, 'YYYY-MM')`;
  const res = await db.query(
    `SELECT ${monthExpr} as month,
            COALESCE(SUM(CASE WHEN a.type = 'income' THEN jl.credit - jl.debit ELSE 0 END), 0) as income,
            COALESCE(SUM(CASE WHEN a.type = 'expense' THEN jl.debit - jl.credit ELSE 0 END), 0) as expense
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE je.company_id = $1 AND a.type IN ('income', 'expense')
     GROUP BY month
     ORDER BY month DESC
     LIMIT $2`,
    [companyId, months]
  );
  return res.rows
    .map((r) => ({ month: r.month, income: Number(r.income) || 0, expense: Number(r.expense) || 0 }))
    .reverse();
}

async function getDashboardSummary(companyId) {
  const [bankBalance, cashOnHand, monthExpenses, monthIncome, outstandingCust, outstandingSupp, recent, trend] = await Promise.all([
    balanceForGroup(companyId, 'Bank Accounts'),
    balanceForGroup(companyId, 'Cash'),
    expensesThisMonth(companyId),
    incomeThisMonth(companyId),
    outstandingCustomers(companyId),
    outstandingSuppliers(companyId),
    recentTransactions(companyId),
    monthlyTrend(companyId),
  ]);

  return {
    bankBalance,
    cashOnHand,
    monthlyExpenses: monthExpenses,
    monthlyIncome: monthIncome,
    profitLoss: monthIncome - monthExpenses,
    outstandingCustomers: outstandingCust,
    outstandingSuppliers: outstandingSupp,
    recentTransactions: recent,
    monthlyTrend: trend,
  };
}

module.exports = { getDashboardSummary };
