const crypto = require('crypto');
const db = require('../config/db');
const chronosync = require('../services/chronosync.client');
const { postPayrollJournal } = require('../services/journal.service');
const { isApprovalRequired, createApprovalRequest } = require('../services/approval.service');

const ACCOUNT_CODES = {
  salaryExpense: '5000',
  ssnitErExpense: '5001',
  tier2ErExpense: '5002',
  payePayable: '2200',
  ssnitEePayable: '2300',
  ssnitErPayable: '2310',
  tier2EePayable: '2320',
  tier2ErPayable: '2330',
  netSalariesPayable: '2400',
};

async function loadPayrollAccounts(companyId) {
  const codes = Object.values(ACCOUNT_CODES);
  const placeholders = codes.map((_, i) => `$${i + 2}`).join(',');
  const res = await db.query(`SELECT code, id FROM accounts WHERE company_id = $1 AND code IN (${placeholders})`, [companyId, ...codes]);
  const byCode = Object.fromEntries(res.rows.map((r) => [r.code, r.id]));
  const missing = codes.filter((c) => !byCode[c]);
  if (missing.length > 0) {
    throw Object.assign(new Error(`Missing GL account mapping for codes: ${missing.join(', ')}. Re-run the seed script.`), { status: 400 });
  }
  return {
    salaryExpense: byCode[ACCOUNT_CODES.salaryExpense],
    ssnitErExpense: byCode[ACCOUNT_CODES.ssnitErExpense],
    tier2ErExpense: byCode[ACCOUNT_CODES.tier2ErExpense],
    payePayable: byCode[ACCOUNT_CODES.payePayable],
    ssnitEePayable: byCode[ACCOUNT_CODES.ssnitEePayable],
    ssnitErPayable: byCode[ACCOUNT_CODES.ssnitErPayable],
    tier2EePayable: byCode[ACCOUNT_CODES.tier2EePayable],
    tier2ErPayable: byCode[ACCOUNT_CODES.tier2ErPayable],
    netSalariesPayable: byCode[ACCOUNT_CODES.netSalariesPayable],
  };
}

async function listAvailableRuns(req, res) {
  const { companyId } = req.user;
  const runs = await chronosync.listPayrollRuns();
  const importedRes = await db.query(`SELECT chronosync_run_id FROM payroll_imports WHERE company_id = $1`, [companyId]);
  const importedIds = new Set(importedRes.rows.map((r) => String(r.chronosync_run_id)));

  res.json({
    mocked: chronosync.isMocked(),
    runs: runs.map((r) => ({ ...r, imported: importedIds.has(String(r.id)) })),
  });
}

async function listImports(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT * FROM payroll_imports WHERE company_id = $1 ORDER BY imported_at DESC`,
    [companyId]
  );
  res.json({ imports: result.rows });
}

/**
 * Run Payroll (spec Section 7): the user just picks a posted ChronoSync run and clicks
 * Import. Everything else — looking up the nine GL accounts, building the balanced
 * entry, recording the mirror so it can't be imported twice — happens automatically.
 * Pulled apart so the Approval Workflow can call the same posting logic once a pending
 * request is approved.
 */
async function buildImport(companyId, userId, runId) {
  const already = await db.query(`SELECT id FROM payroll_imports WHERE company_id = $1 AND chronosync_run_id = $2`, [companyId, runId]);
  if (already.rows[0]) throw Object.assign(new Error('This payroll run has already been imported.'), { status: 409 });

  const run = await chronosync.getPayrollRun(runId);
  const accounts = await loadPayrollAccounts(companyId);

  const totals = {
    gross: Number(run.total_gross || 0),
    net: Number(run.total_net || 0),
    paye: Number(run.total_paye || 0),
    ssnitEe: Number(run.total_ssnit_ee || 0),
    ssnitEr: Number(run.total_ssnit_er || 0),
    tier2Ee: Number(run.total_tier2_ee || 0),
    tier2Er: Number(run.total_tier2_er || 0),
  };

  const payrollDate = `${run.period_year}-${String(run.period_month).padStart(2, '0')}-01`;
  const importId = crypto.randomUUID();

  const journalEntryId = await postPayrollJournal({
    companyId,
    accounts,
    totals,
    payrollDate,
    reference: `PAYROLL-${run.period_year}-${String(run.period_month).padStart(2, '0')}`,
    description: `Payroll ${run.period_year}-${String(run.period_month).padStart(2, '0')} (${run.employee_count} employees)`,
    createdBy: userId,
    sourceId: importId,
  });

  await db.query(
    `INSERT INTO payroll_imports (id, company_id, chronosync_run_id, period_year, period_month, total_gross, total_net, employee_count, journal_entry_id, imported_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [importId, companyId, String(run.id), run.period_year, run.period_month, totals.gross, totals.net, run.employee_count || 0, journalEntryId, userId]
  );

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'import','payroll_run',$4,$5)`,
    [crypto.randomUUID(), companyId, userId, String(run.id), JSON.stringify({ gross: totals.gross, net: totals.net })]
  );

  return { importId, journalEntryId, run };
}

async function describePayrollImportRequest(runId) {
  const run = await chronosync.getPayrollRun(runId);
  return {
    description: `Payroll ${run.period_year}-${String(run.period_month).padStart(2, '0')} (${run.employee_count} employees)`,
    amount: Number(run.total_gross || 0),
  };
}

async function importRun(req, res) {
  const { companyId, sub: userId } = req.user;
  const { runId } = req.params;

  const already = await db.query(`SELECT id FROM payroll_imports WHERE company_id = $1 AND chronosync_run_id = $2`, [companyId, runId]);
  if (already.rows[0]) return res.status(409).json({ error: 'This payroll run has already been imported.' });

  const companyRes = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = companyRes.rows[0];

  if (isApprovalRequired(company, 'payroll_import')) {
    const { description, amount } = await describePayrollImportRequest(runId);
    const request = await createApprovalRequest({ companyId, userId, module: 'payroll_import', payload: { runId }, description, amount, currency: company.currency });
    return res.status(202).json({ pendingApproval: true, approvalRequestId: request.id, message: 'Submitted for approval — the payroll run will be imported once approved.' });
  }

  // Approval isn't required for this company, so this is a direct import — keep the
  // original role restriction for that path (it only relaxes when a request has to be
  // queued for someone else to approve).
  if (!['administrator', 'accountant', 'finance_manager', 'super_administrator'].includes(req.user.role)) {
    return res.status(403).json({ error: "You don't have permission to do that." });
  }

  const { importId, journalEntryId } = await buildImport(companyId, userId, runId);
  res.status(201).json({ importId, journalEntryId });
}

module.exports = { listAvailableRuns, listImports, importRun, buildImport, describePayrollImportRequest };
