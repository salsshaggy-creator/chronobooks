const db = require('../config/db');

/**
 * These three reports are deliberately just queries over journal_lines/accounts — no
 * new tables, no cached numbers to keep in sync. That's the payoff of posting every
 * business event through the same auto-journal engine (journal.service.js): the
 * reports are just different views of the same ledger.
 */

/** Profit & Loss: income and expenses posted within [fromDate, toDate]. */
async function profitAndLoss(companyId, fromDate, toDate) {
  const res = await db.query(
    `SELECT a.type, a.group_name,
            COALESCE(SUM(jl.debit),0) as debit,
            COALESCE(SUM(jl.credit),0) as credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE je.company_id = $1 AND a.type IN ('income','expense')
       AND je.entry_date >= $2 AND je.entry_date <= $3
     GROUP BY a.type, a.group_name
     HAVING COALESCE(SUM(jl.debit),0) != 0 OR COALESCE(SUM(jl.credit),0) != 0
     ORDER BY a.type, a.group_name`,
    [companyId, fromDate, toDate]
  );

  const income = [];
  const expenses = [];
  for (const row of res.rows) {
    if (row.type === 'income') {
      income.push({ label: row.group_name, amount: Number(row.credit) - Number(row.debit) });
    } else {
      expenses.push({ label: row.group_name, amount: Number(row.debit) - Number(row.credit) });
    }
  }

  const totalIncome = income.reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = expenses.reduce((sum, r) => sum + r.amount, 0);

  return { fromDate, toDate, income, expenses, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses };
}

/** Balance for every account of the given type(s), cumulative up to asOfDate. */
async function accountBalancesAsOf(companyId, asOfDate, types) {
  const typePlaceholders = types.map((_, i) => `$${i + 3}`).join(',');
  // The date filter has to live inside the SUM, not on the journal_entries JOIN's ON
  // clause — a LEFT JOIN with a date condition in its ON clause still preserves the
  // journal_lines row (with NULLed-out je.* columns) when the date doesn't match, which
  // would silently include activity dated after asOfDate in the "as of" total.
  // CASE-gating each line avoids that while still returning every account, even ones
  // with zero activity, thanks to the outer LEFT JOINs and COALESCE.
  const res = await db.query(
    `SELECT a.code, a.name, a.type, a.group_name,
            COALESCE(SUM(CASE WHEN je.entry_date <= $2 THEN jl.debit ELSE 0 END),0) as debit,
            COALESCE(SUM(CASE WHEN je.entry_date <= $2 THEN jl.credit ELSE 0 END),0) as credit
     FROM accounts a
     LEFT JOIN journal_lines jl ON jl.account_id = a.id
     LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE a.company_id = $1 AND a.type IN (${typePlaceholders})
     GROUP BY a.id, a.code, a.name, a.type, a.group_name
     ORDER BY a.code`,
    [companyId, asOfDate, ...types]
  );
  return res.rows.map((r) => ({
    code: r.code,
    name: r.name,
    type: r.type,
    groupName: r.group_name,
    debit: Number(r.debit),
    credit: Number(r.credit),
    net: Number(r.debit) - Number(r.credit),
  }));
}

/** Balance Sheet: Assets = Liabilities + Equity (+ current earnings), as of a date. */
async function balanceSheet(companyId, asOfDate) {
  const [assets, liabilities, equity, pl] = await Promise.all([
    accountBalancesAsOf(companyId, asOfDate, ['asset']),
    accountBalancesAsOf(companyId, asOfDate, ['liability']),
    accountBalancesAsOf(companyId, asOfDate, ['equity']),
    profitAndLoss(companyId, '2000-01-01', asOfDate),
  ]);

  const assetRows = assets.filter((a) => a.net !== 0).map((a) => ({ label: a.name, amount: a.net }));
  const liabilityRows = liabilities.filter((a) => a.net !== 0).map((a) => ({ label: a.name, amount: -a.net }));
  const equityRows = equity.filter((a) => a.net !== 0).map((a) => ({ label: a.name, amount: -a.net }));

  // Income-statement accounts are "temporary" — until a year-end close moves them into
  // Retained Earnings, the Balance Sheet shows them live as Current Year Earnings so
  // Assets actually equals Liabilities + Equity at any point in time.
  equityRows.push({ label: 'Current Year Earnings', amount: pl.netProfit });

  const totalAssets = assetRows.reduce((sum, r) => sum + r.amount, 0);
  const totalLiabilities = liabilityRows.reduce((sum, r) => sum + r.amount, 0);
  const totalEquity = equityRows.reduce((sum, r) => sum + r.amount, 0);

  return {
    asOfDate,
    assets: assetRows,
    liabilities: liabilityRows,
    equity: equityRows,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  };
}

/** Trial Balance: every account's net ledger position as of a date. Debit total must equal Credit total. */
async function trialBalance(companyId, asOfDate) {
  const accounts = await accountBalancesAsOf(companyId, asOfDate, ['asset', 'liability', 'equity', 'income', 'expense']);
  const rows = accounts
    .filter((a) => a.net !== 0)
    .map((a) => ({
      code: a.code,
      name: a.name,
      debit: a.net > 0 ? a.net : 0,
      credit: a.net < 0 ? -a.net : 0,
    }));

  const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);

  return { asOfDate, rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

/**
 * Cost Centre breakdown: income (Sales invoices) and expenses (Purchases bills +
 * standalone Expenses) tagged with a cost centre, for [fromDate, toDate]. Deliberately
 * scoped to these three transactional tables — the same three that carry the cost
 * centre picker — rather than every journal_lines row, so it doesn't try to force a
 * cost centre onto ledger activity that was never tagged with one (bank interest/
 * charges, manual journal entries, payroll). Untagged records within those three
 * tables land in "Unassigned" so the totals still reconcile with what those modules
 * actually recorded for the period.
 */
async function costCentreBreakdown(companyId, fromDate, toDate) {
  const centresRes = await db.query(`SELECT id, code, name FROM cost_centres WHERE company_id = $1 ORDER BY code`, [companyId]);

  const [incomeRes, billRes, expenseRes] = await Promise.all([
    db.query(
      `SELECT cost_centre_id, COALESCE(SUM(total),0) as amount FROM invoices
       WHERE company_id = $1 AND invoice_date >= $2 AND invoice_date <= $3
       GROUP BY cost_centre_id`,
      [companyId, fromDate, toDate]
    ),
    db.query(
      `SELECT cost_centre_id, COALESCE(SUM(total),0) as amount FROM bills
       WHERE company_id = $1 AND bill_date >= $2 AND bill_date <= $3
       GROUP BY cost_centre_id`,
      [companyId, fromDate, toDate]
    ),
    db.query(
      `SELECT cost_centre_id, COALESCE(SUM(amount),0) as amount FROM expenses
       WHERE company_id = $1 AND expense_date >= $2 AND expense_date <= $3
       GROUP BY cost_centre_id`,
      [companyId, fromDate, toDate]
    ),
  ]);

  const key = (id) => (id === null || id === undefined ? 'unassigned' : id);
  const incomeById = {};
  for (const r of incomeRes.rows) incomeById[key(r.cost_centre_id)] = Number(r.amount);
  const expenseById = {};
  for (const r of billRes.rows) expenseById[key(r.cost_centre_id)] = (expenseById[key(r.cost_centre_id)] || 0) + Number(r.amount);
  for (const r of expenseRes.rows) expenseById[key(r.cost_centre_id)] = (expenseById[key(r.cost_centre_id)] || 0) + Number(r.amount);

  const centres = centresRes.rows.map((c) => {
    const income = incomeById[c.id] || 0;
    const expenses = expenseById[c.id] || 0;
    return { id: c.id, code: c.code, name: c.name, income, expenses, net: income - expenses };
  });

  const unassignedIncome = incomeById.unassigned || 0;
  const unassignedExpenses = expenseById.unassigned || 0;
  const unassigned = { income: unassignedIncome, expenses: unassignedExpenses, net: unassignedIncome - unassignedExpenses };

  const totalIncome = centres.reduce((sum, c) => sum + c.income, 0) + unassignedIncome;
  const totalExpenses = centres.reduce((sum, c) => sum + c.expenses, 0) + unassignedExpenses;

  return { fromDate, toDate, centres, unassigned, totalIncome, totalExpenses, totalNet: totalIncome - totalExpenses };
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const CASH_FLOW_LABELS = {
  receipt: 'Customer payments received',
  supplier_payment: 'Paid to suppliers',
  expense: 'Operating expenses paid',
  bank_charge: 'Bank charges',
  interest: 'Interest earned',
  deposit: 'Cash deposited to bank',
  withdrawal: 'Cash withdrawn from bank',
  transfer: 'Transfer between bank accounts',
  manual: 'Manual journal entries',
  fixed_asset: 'Fixed asset purchases',
  fixed_asset_disposal: 'Fixed asset disposal proceeds',
  opening_balance: 'Opening capital',
};

function cashFlowLabel(sourceType) {
  const isVoid = sourceType.endsWith('_void');
  const base = isVoid ? sourceType.slice(0, -'_void'.length) : sourceType;
  const label = CASH_FLOW_LABELS[base] || base.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return isVoid ? `${label} (voided)` : label;
}

/**
 * Cash Flow: how much actual cash moved, not just what was earned/spent on paper (that's
 * the P&L). Built the same way as the other reports — a view over journal_lines, this
 * time filtered to only the lines that hit a Cash or Bank Accounts account, since that's
 * the only thing "cash flow" means. Movements are grouped by source_type into the three
 * standard buckets: Investing is fixed-asset purchases/disposals, Financing is opening
 * capital, and everything else that touches cash directly falls under Operating —
 * transfers between the company's own cash and bank accounts always net to zero here
 * automatically (one line debits, the other credits, both inside the same Cash+Bank
 * total), which is correct: moving your own money between your own accounts isn't a
 * cash flow.
 */
async function cashFlow(companyId, fromDate, toDate) {
  const movementRes = await db.query(
    `SELECT je.source_type, COALESCE(SUM(jl.debit),0) as debit, COALESCE(SUM(jl.credit),0) as credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE je.company_id = $1 AND a.group_name IN ('Cash', 'Bank Accounts')
       AND je.entry_date >= $2 AND je.entry_date <= $3
     GROUP BY je.source_type`,
    [companyId, fromDate, toDate]
  );

  const buckets = { operating: 0, investing: 0, financing: 0 };
  const lines = { operating: [], investing: [], financing: [] };
  for (const row of movementRes.rows) {
    const net = round2(Number(row.debit) - Number(row.credit));
    if (Math.abs(net) < 0.005) continue;
    const base = row.source_type.endsWith('_void') ? row.source_type.slice(0, -'_void'.length) : row.source_type;
    const bucket = base.startsWith('fixed_asset') ? 'investing' : base === 'opening_balance' ? 'financing' : 'operating';
    buckets[bucket] += net;
    lines[bucket].push({ sourceType: row.source_type, label: cashFlowLabel(row.source_type), amount: net });
  }

  const closingRes = await db.query(
    `SELECT COALESCE(SUM(jl.debit),0) as debit, COALESCE(SUM(jl.credit),0) as credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE je.company_id = $1 AND a.group_name IN ('Cash', 'Bank Accounts') AND je.entry_date <= $2`,
    [companyId, toDate]
  );
  const closingCash = round2(Number(closingRes.rows[0].debit) - Number(closingRes.rows[0].credit));
  const netChange = round2(buckets.operating + buckets.investing + buckets.financing);
  const openingCash = round2(closingCash - netChange);

  return {
    fromDate, toDate,
    operating: { total: round2(buckets.operating), lines: lines.operating },
    investing: { total: round2(buckets.investing), lines: lines.investing },
    financing: { total: round2(buckets.financing), lines: lines.financing },
    netChange,
    openingCash,
    closingCash,
  };
}

module.exports = { profitAndLoss, balanceSheet, trialBalance, costCentreBreakdown, cashFlow };
