// Smoke test for the Approval Workflow + e-signatures: turning on each module's
// toggle queues a request instead of posting immediately, an approver's decision
// (with a captured signature) either creates the real record via the exact same
// build* logic the direct path uses, or a rejection creates nothing at all, and a
// requester can never approve their own request.
require('dotenv').config();
const app = require('./src/app');
const db = require('./src/config/db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const FAKE_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function log(label, data) {
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const login = async (email, password) =>
    (await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })).json();

  const adminLogin = await login('admin@demo-sme.com', 'ChronoBooks!123');
  const adminHeaders = { Authorization: `Bearer ${adminLogin.accessToken}`, 'Content-Type': 'application/json' };
  const companyId = adminLogin.user.companyId;

  // Second approver (finance_manager) + a non-approver requester (cashier).
  const financeRole = (await db.query(`SELECT id FROM roles WHERE code = 'finance_manager'`, [])).rows[0];
  const cashierRole = (await db.query(`SELECT id FROM roles WHERE code = 'cashier'`, [])).rows[0];
  const pw = await bcrypt.hash('ApprovalTest!1', 10);
  const financeId = crypto.randomUUID();
  const cashierId = crypto.randomUUID();
  await db.query(`INSERT INTO users (id, company_id, email, password_hash, full_name, role_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [financeId, companyId, 'finance@demo-sme.com', pw, 'Finance Manager', financeRole.id]);
  await db.query(`INSERT INTO users (id, company_id, email, password_hash, full_name, role_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [cashierId, companyId, 'cashier2@demo-sme.com', pw, 'Demo Cashier Two', cashierRole.id]);
  const financeLogin = await login('finance@demo-sme.com', 'ApprovalTest!1');
  const cashierLogin = await login('cashier2@demo-sme.com', 'ApprovalTest!1');
  const financeHeaders = { Authorization: `Bearer ${financeLogin.accessToken}`, 'Content-Type': 'application/json' };
  const cashierHeaders = { Authorization: `Bearer ${cashierLogin.accessToken}`, 'Content-Type': 'application/json' };

  // A directly-posted invoice (toggles still off) to have something to submit a receipt against later.
  const customers = await (await fetch(`${base}/api/customers`, { headers: adminHeaders })).json();
  const customerId = customers.customers[0].id;
  const directInvoice = await (await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ customerId, invoiceDate: '2026-02-01', lines: [{ description: 'Consulting', quantity: 1, unitPrice: 1000 }] }),
  })).json();

  // Turn on every approval toggle.
  const before = await (await fetch(`${base}/api/company`, { headers: adminHeaders })).json();
  await fetch(`${base}/api/company`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ ...before, approvalRequiredSales: true, approvalRequiredPurchases: true, approvalRequiredReceipts: true, approvalRequiredExpenses: true, approvalRequiredPayroll: true }),
  });

  const invoicesBefore = await (await fetch(`${base}/api/invoices`, { headers: adminHeaders })).json();

  // --- 1. Sales invoice queues instead of posting; self-approval is blocked; a different approver can approve without a fresh signature draw (falls back to saved). ---
  const invoiceSubmit = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: adminHeaders, // the admin themselves submits this one, to test the self-approval rule
    body: JSON.stringify({ customerId, invoiceDate: '2026-02-02', lines: [{ description: 'Design work', quantity: 2, unitPrice: 500 }] }),
  });
  const invoiceSubmitBody = await invoiceSubmit.json();
  const invoicesAfterSubmit = await (await fetch(`${base}/api/invoices`, { headers: adminHeaders })).json();
  log('invoice submitted for approval', { status: invoiceSubmit.status, body: invoiceSubmitBody, countBefore: invoicesBefore.invoices.length, countAfter: invoicesAfterSubmit.invoices.length });
  const queuedNotPostedOk = invoiceSubmit.status === 202 && invoicesAfterSubmit.invoices.length === invoicesBefore.invoices.length;

  const selfApprove = await fetch(`${base}/api/approvals/${invoiceSubmitBody.approvalRequestId}/approve`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ signatureData: FAKE_SIGNATURE }),
  });
  log('admin tries to approve their own request (expect 403)', { status: selfApprove.status });
  const selfApproveBlockedOk = selfApprove.status === 403;

  const missingSignature = await fetch(`${base}/api/approvals/${invoiceSubmitBody.approvalRequestId}/approve`, {
    method: 'POST', headers: financeHeaders, body: JSON.stringify({}),
  });
  log('finance approves with no signature on file yet (expect 400)', { status: missingSignature.status });
  const noSignatureBlockedOk = missingSignature.status === 400;

  await fetch(`${base}/api/my-signature`, { method: 'PUT', headers: financeHeaders, body: JSON.stringify({ signatureData: FAKE_SIGNATURE }) });
  const approveInvoice = await fetch(`${base}/api/approvals/${invoiceSubmitBody.approvalRequestId}/approve`, {
    method: 'POST', headers: financeHeaders, body: JSON.stringify({ comments: 'Looks good' }),
  });
  const approveInvoiceBody = await approveInvoice.json();
  const invoicesAfterApprove = await (await fetch(`${base}/api/invoices`, { headers: adminHeaders })).json();
  log('finance approves using saved signature', { status: approveInvoice.status, body: approveInvoiceBody, countAfter: invoicesAfterApprove.invoices.length });
  const approvedCreatesRecordOk = approveInvoice.status === 200 && invoicesAfterApprove.invoices.length === invoicesBefore.invoices.length + 1;

  // --- 2. Purchase bill: rejection creates nothing. ---
  const suppliers = await (await fetch(`${base}/api/suppliers`, { headers: adminHeaders })).json();
  const supplierId = suppliers.suppliers[0].id;
  const billsBefore = await (await fetch(`${base}/api/bills`, { headers: adminHeaders })).json();
  const billSubmit = await (await fetch(`${base}/api/bills`, {
    method: 'POST', headers: cashierHeaders,
    body: JSON.stringify({ supplierId, billDate: '2026-02-03', lines: [{ description: 'Stationery', quantity: 1, unitPrice: 200 }] }),
  })).json();
  const rejectNoComment = await fetch(`${base}/api/approvals/${billSubmit.approvalRequestId}/reject`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({}) });
  const reject = await fetch(`${base}/api/approvals/${billSubmit.approvalRequestId}/reject`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ comments: 'Not a valid expense' }) });
  const billsAfterReject = await (await fetch(`${base}/api/bills`, { headers: adminHeaders })).json();
  log('bill rejected', { rejectNoCommentStatus: rejectNoComment.status, rejectStatus: reject.status, countBefore: billsBefore.bills.length, countAfter: billsAfterReject.bills.length });
  const rejectionOk = rejectNoComment.status === 400 && reject.status === 200 && billsAfterReject.bills.length === billsBefore.bills.length;

  // --- 3. Per Diem expense: amount is computed from days * daily rate, not the caller. ---
  const perDiemSubmit = await (await fetch(`${base}/api/expenses`, {
    method: 'POST', headers: cashierHeaders,
    body: JSON.stringify({ expenseType: 'per_diem', destination: 'Kumasi site visit', days: 3, dailyRate: 150, expenseDate: '2026-02-04', paidFromAccountCode: '1010' }),
  })).json();
  const perDiemApprove = await fetch(`${base}/api/approvals/${perDiemSubmit.approvalRequestId}/approve`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ signatureData: FAKE_SIGNATURE }) });
  const perDiemApproveBody = await perDiemApprove.json();
  const expenseRow = (await db.query(`SELECT * FROM expenses WHERE id = $1`, [perDiemApproveBody.resultId])).rows[0];
  log('per diem approved', { submit: perDiemSubmit, approveStatus: perDiemApprove.status, expenseRow });
  const perDiemOk = perDiemApprove.status === 200 && expenseRow && Number(expenseRow.amount) === 450 && expenseRow.category === 'Travel & Per Diem' && expenseRow.expense_type === 'per_diem';

  // --- 4. Receipt against the pre-existing direct invoice. ---
  const receiptSubmit = await (await fetch(`${base}/api/receipts`, {
    method: 'POST', headers: cashierHeaders,
    body: JSON.stringify({ invoiceId: directInvoice.invoiceId, receiptDate: '2026-02-05', depositedToAccountCode: '1010', amount: 400 }),
  })).json();
  const receiptApprove = await fetch(`${base}/api/approvals/${receiptSubmit.approvalRequestId}/approve`, { method: 'POST', headers: financeHeaders, body: JSON.stringify({}) });
  const invoiceAfterReceipt = await (await fetch(`${base}/api/invoices`, { headers: adminHeaders })).json();
  const matchedInvoice = invoiceAfterReceipt.invoices.find((i) => i.id === directInvoice.invoiceId);
  log('receipt approved against existing invoice', { receiptApproveStatus: receiptApprove.status, invoiceStatus: matchedInvoice?.status, invoicePaid: matchedInvoice?.paid });
  const receiptOk = receiptApprove.status === 200 && matchedInvoice?.status === 'partially_paid' && Number(matchedInvoice?.paid) === 400;

  // --- 5. Payroll import: two pending requests get queued for the same run (nothing's
  // imported yet, so both are accepted); approving the first posts it; approving the
  // second — now stale — fails cleanly via buildImport's own duplicate check and
  // leaves that second request untouched (still pending, not silently marked approved).
  const availableRuns = await (await fetch(`${base}/api/payroll/available-runs`, { headers: adminHeaders })).json();
  const runId = availableRuns.runs[0].id;
  const payrollSubmitA = await (await fetch(`${base}/api/payroll/import/${runId}`, { method: 'POST', headers: cashierHeaders })).json();
  const payrollSubmitB = await (await fetch(`${base}/api/payroll/import/${runId}`, { method: 'POST', headers: cashierHeaders })).json();
  const payrollApprove = await fetch(`${base}/api/approvals/${payrollSubmitA.approvalRequestId}/approve`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ signatureData: FAKE_SIGNATURE }) });
  const payrollImports = await (await fetch(`${base}/api/payroll/imports`, { headers: adminHeaders })).json();

  const payrollApproveStale = await fetch(`${base}/api/approvals/${payrollSubmitB.approvalRequestId}/approve`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ signatureData: FAKE_SIGNATURE }) });
  const staleRequest = (await db.query(`SELECT status FROM approval_requests WHERE id = $1`, [payrollSubmitB.approvalRequestId])).rows[0];
  log('payroll import approved once, a second pending request for the same run fails without corrupting state', {
    bothQueued: !!payrollSubmitA.approvalRequestId && !!payrollSubmitB.approvalRequestId, firstApproveStatus: payrollApprove.status, importsCount: payrollImports.imports.length,
    staleApproveStatus: payrollApproveStale.status, staleRequestStatus: staleRequest.status,
  });
  const payrollOk = payrollApprove.status === 200 && payrollImports.imports.length === 1 && payrollApproveStale.status === 409 && staleRequest.status === 'pending';

  // --- 6. Free-standing document signing — no side-effect record, just a signed artifact. ---
  const docSubmit = await (await fetch(`${base}/api/approvals/documents`, {
    method: 'POST', headers: cashierHeaders, body: JSON.stringify({ title: 'Staff handbook acknowledgement', notes: 'Please sign to confirm receipt.' }),
  })).json();
  const docApprove = await fetch(`${base}/api/approvals/${docSubmit.id}/approve`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ signatureData: FAKE_SIGNATURE, comments: 'Acknowledged' }) });
  const docRow = (await db.query(`SELECT * FROM approval_requests WHERE id = $1`, [docSubmit.id])).rows[0];
  log('document signed', { submit: docSubmit, approveStatus: docApprove.status, docRowStatus: docRow.status, hasSignature: !!docRow.signature_data, resultId: docRow.result_module_id });
  const documentOk = docApprove.status === 200 && docRow.status === 'approved' && !!docRow.signature_data && docRow.result_module_id === null;

  // --- 7. History/scope views + trial balance still balances after everything above. ---
  const history = await (await fetch(`${base}/api/approvals?scope=history`, { headers: adminHeaders })).json();
  const cashierMine = await (await fetch(`${base}/api/approvals?scope=mine`, { headers: cashierHeaders })).json();
  const tb = await (await fetch(`${base}/api/reports/trial-balance?asOf=2026-12-31`, { headers: adminHeaders })).json();
  log('history + scoping + trial balance', { historyCount: history.requests.length, cashierMineCount: cashierMine.requests.length, tbBalanced: tb.balanced });
  const scopingOk = history.requests.every((r) => r.status !== 'pending') && cashierMine.requests.every((r) => r.requested_by_name) && tb.balanced;

  const allOk = queuedNotPostedOk && selfApproveBlockedOk && noSignatureBlockedOk && approvedCreatesRecordOk && rejectionOk && perDiemOk && receiptOk && payrollOk && documentOk && scopingOk;

  console.log(`\n== RESULT: ${allOk ? 'PASS' : 'FAIL'} ==`);
  console.log(`Toggling approval on queues instead of posting: ${queuedNotPostedOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Requester can't approve their own request: ${selfApproveBlockedOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Approving with no signature anywhere is blocked: ${noSignatureBlockedOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Approval reuses build logic and creates the real record: ${approvedCreatesRecordOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Rejection creates nothing + requires a reason: ${rejectionOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Per Diem amount computed server-side (days x rate): ${perDiemOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Receipt approval updates the original invoice: ${receiptOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Payroll import approval posts once, duplicate fails cleanly: ${payrollOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Free-standing document signing works: ${documentOk ? 'OK' : 'MISMATCH'}`);
  console.log(`History/scope views + books still balance: ${scopingOk ? 'OK' : 'MISMATCH'}`);

  server.close();
  await db.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
