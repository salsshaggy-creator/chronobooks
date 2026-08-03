const crypto = require('crypto');
const db = require('../config/db');
const { createApprovalRequest } = require('../services/approval.service');
const invoiceController = require('./invoice.controller');
const billController = require('./bill.controller');
const receiptController = require('./receipt.controller');
const expenseController = require('./expense.controller');
const payrollController = require('./payroll.controller');

// Who can decide a pending request — the same set across every module for now (a
// reasonable v1 default; routing specific modules to specific approver roles, e.g.
// Accounts Payable Officer for purchase_bill only, is a natural later extension of
// this same table rather than a rebuild).
const APPROVER_ROLES = ['administrator', 'finance_manager', 'super_administrator'];

function isApprover(role) {
  return APPROVER_ROLES.includes(role);
}

/**
 * scope=pending (default): everything waiting on a decision — the full company queue
 * for an approver, or just the caller's own pending submissions for anyone else.
 * scope=mine: everything the caller has ever submitted, any status.
 * scope=history: everything already decided — company-wide for an approver, the
 * caller's own decided requests otherwise.
 */
async function listApprovalRequests(req, res) {
  const { companyId, sub: userId, role } = req.user;
  const scope = req.query.scope || 'pending';
  const approver = isApprover(role);

  const clauses = ['ar.company_id = $1'];
  const params = [companyId];

  if (scope === 'mine') {
    clauses.push(`ar.requested_by = $${params.push(userId)}`);
  } else if (scope === 'history') {
    clauses.push(`ar.status != 'pending'`);
    if (!approver) clauses.push(`ar.requested_by = $${params.push(userId)}`);
  } else {
    clauses.push(`ar.status = 'pending'`);
    if (!approver) clauses.push(`ar.requested_by = $${params.push(userId)}`);
  }

  const result = await db.query(
    `SELECT ar.*, ru.full_name as requested_by_name, au.full_name as approver_name
     FROM approval_requests ar
     JOIN users ru ON ru.id = ar.requested_by
     LEFT JOIN users au ON au.id = ar.approver_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY ar.created_at DESC`,
    params
  );
  res.json({ requests: result.rows, canApprove: approver });
}

async function loadOwnedRequest(companyId, id) {
  const result = await db.query(`SELECT * FROM approval_requests WHERE id = $1 AND company_id = $2`, [id, companyId]);
  return result.rows[0];
}

/** Falls back to the approver's saved signature if none was drawn fresh for this decision. */
async function resolveSignature(userId, providedSignature) {
  if (providedSignature) return providedSignature;
  const saved = await db.query(`SELECT signature_data FROM signatures WHERE user_id = $1`, [userId]);
  return saved.rows[0]?.signature_data || null;
}

/**
 * Approve — dispatches to the exact same build* function each module's direct-create
 * path already uses, so an approved request is posted with identical, already-tested
 * logic. The original requester stays the record's "created by"; this decision (who
 * approved it, when, with what signature) lives on the approval_requests row itself.
 */
async function approve(req, res) {
  const { companyId, sub: approverId } = req.user;
  const { id } = req.params;
  const { signatureData, comments } = req.body;

  const request = await loadOwnedRequest(companyId, id);
  if (!request) return res.status(404).json({ error: 'Approval request not found.' });
  if (request.status !== 'pending') return res.status(409).json({ error: `This request was already ${request.status}.` });
  if (request.requested_by === approverId) return res.status(403).json({ error: "You can't approve your own request — ask another approver to review it." });

  const signature = await resolveSignature(approverId, signatureData);
  if (!signature) return res.status(400).json({ error: 'A signature is required to approve — draw one now or save one first in Settings → My Account.' });

  const payload = JSON.parse(request.payload);
  let resultId = null;

  if (request.module === 'sales_invoice') {
    resultId = (await invoiceController.buildInvoice(companyId, request.requested_by, payload)).invoiceId;
  } else if (request.module === 'purchase_bill') {
    resultId = (await billController.buildBill(companyId, request.requested_by, payload)).billId;
  } else if (request.module === 'receipt') {
    resultId = (await receiptController.buildReceipt(companyId, request.requested_by, payload)).receiptId;
  } else if (request.module === 'per_diem_expense') {
    resultId = (await expenseController.buildExpense(companyId, request.requested_by, payload)).expenseId;
  } else if (request.module === 'payroll_import') {
    resultId = (await payrollController.buildImport(companyId, request.requested_by, payload.runId)).importId;
  } else if (request.module === 'document') {
    resultId = null; // a signed document has no side-effect record — the signature itself is the artifact
  }

  await db.query(
    `UPDATE approval_requests SET status = 'approved', approver_id = $1, decided_at = $2, comments = $3, signature_data = $4, result_module_id = $5 WHERE id = $6`,
    [approverId, new Date().toISOString(), comments || null, signature, resultId, id]
  );

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'approve','approval_request',$4,$5)`,
    [crypto.randomUUID(), companyId, approverId, id, JSON.stringify({ module: request.module, resultId })]
  );

  res.json({ ok: true, resultId });
}

async function reject(req, res) {
  const { companyId, sub: approverId } = req.user;
  const { id } = req.params;
  const { comments } = req.body;

  const request = await loadOwnedRequest(companyId, id);
  if (!request) return res.status(404).json({ error: 'Approval request not found.' });
  if (request.status !== 'pending') return res.status(409).json({ error: `This request was already ${request.status}.` });
  if (request.requested_by === approverId) return res.status(403).json({ error: "You can't reject your own request — ask another approver to review it." });
  if (!comments) return res.status(400).json({ error: 'A reason is required when rejecting a request.' });

  await db.query(
    `UPDATE approval_requests SET status = 'rejected', approver_id = $1, decided_at = $2, comments = $3 WHERE id = $4`,
    [approverId, new Date().toISOString(), comments, id]
  );

  await db.query(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,'reject','approval_request',$4,$5)`,
    [crypto.randomUUID(), companyId, approverId, id, JSON.stringify({ module: request.module, comments })]
  );

  res.json({ ok: true });
}

/** Free-standing document signing — e.g. a contract or policy that just needs to be signed, with nothing to post to the ledger. Always goes through approval, whether or not any of the transactional toggles are on. */
async function createDocumentRequest(req, res) {
  const { companyId, sub: userId } = req.user;
  const { title, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'A title is required.' });

  const request = await createApprovalRequest({
    companyId, userId, module: 'document', payload: { title, notes }, description: title, amount: null, currency: null,
  });
  res.status(201).json(request);
}

module.exports = { listApprovalRequests, approve, reject, createDocumentRequest };
