const db = require('../config/db');
const { httpError } = require('./approval.service');

/**
 * Shared by buildInvoice/buildBill/buildExpense: an optional costCentreId tags that
 * transaction for the Cost Centre breakdown report. Validated against this company (so
 * one company can never tag a record with another company's cost centre) but otherwise
 * purely a label — it never changes what gets posted to the ledger. Returns null if no
 * cost centre was given, which is exactly how every existing caller behaves today.
 */
async function resolveCostCentreId(companyId, costCentreId) {
  if (!costCentreId) return null;
  const res = await db.query(`SELECT id FROM cost_centres WHERE id = $1 AND company_id = $2`, [costCentreId, companyId]);
  if (!res.rows[0]) throw httpError(400, 'Unknown cost centre.');
  return res.rows[0].id;
}

module.exports = { resolveCostCentreId };
