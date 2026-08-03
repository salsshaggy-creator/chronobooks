const crypto = require('crypto');
const db = require('../config/db');

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// Maps an approval_requests.module value to the company toggle that gates it. Modules
// not listed here (currently just 'document') always require an explicit approval —
// there's no "direct" path for a free-standing document, since asking someone to sign
// something *is* the point of creating one.
const MODULE_TOGGLE_COLUMN = {
  sales_invoice: 'approval_required_sales',
  purchase_bill: 'approval_required_purchases',
  receipt: 'approval_required_receipts',
  per_diem_expense: 'approval_required_expenses',
  payroll_import: 'approval_required_payroll',
};

function isApprovalRequired(company, module) {
  const column = MODULE_TOGGLE_COLUMN[module];
  if (!column) return false;
  return !!company[column];
}

async function createApprovalRequest({ companyId, userId, module, payload, description, amount, currency }) {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO approval_requests (id, company_id, module, payload, description, amount, currency, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, companyId, module, JSON.stringify(payload), description, amount ?? null, currency ?? null, userId]
  );
  return { id, module, description, amount, currency, status: 'pending' };
}

module.exports = { httpError, MODULE_TOGGLE_COLUMN, isApprovalRequired, createApprovalRequest };
