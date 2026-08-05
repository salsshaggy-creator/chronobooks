const db = require('../config/db');

/** Audit Log viewer (write-up System > Audit Log) — the audit_log table already exists and is written to by every posting controller; this is just the read side. */
async function listAuditLog(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at, u.full_name as user_name
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.company_id = $1 ORDER BY a.created_at DESC LIMIT 200`,
    [companyId]
  );
  res.json({ entries: result.rows });
}

/** Login History (write-up Users > Login History) — every attempt, success or failure, written from auth.controller.js's login(). */
async function listLoginHistory(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT id, email, success, reason, ip_address, user_agent, created_at
     FROM login_history WHERE company_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [companyId]
  );
  res.json({ entries: result.rows.map((r) => ({ ...r, success: !!r.success })) });
}

async function getPasswordPolicy(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT password_min_length, password_require_uppercase, password_require_number, password_require_symbol FROM companies WHERE id = $1`, [companyId]);
  const c = result.rows[0];
  res.json({
    minLength: c.password_min_length,
    requireUppercase: !!c.password_require_uppercase,
    requireNumber: !!c.password_require_number,
    requireSymbol: !!c.password_require_symbol,
  });
}

async function updatePasswordPolicy(req, res) {
  const { companyId } = req.user;
  const { minLength, requireUppercase, requireNumber, requireSymbol } = req.body;
  if (minLength && Number(minLength) < 6) return res.status(400).json({ error: 'Minimum length cannot be set below 6.' });
  await db.query(
    `UPDATE companies SET password_min_length = $1, password_require_uppercase = $2, password_require_number = $3, password_require_symbol = $4 WHERE id = $5`,
    [Number(minLength) || 8, requireUppercase ? '1' : '0', requireNumber ? '1' : '0', requireSymbol ? '1' : '0', companyId]
  );
  res.json({ ok: true });
}

module.exports = { listAuditLog, listLoginHistory, getPasswordPolicy, updatePasswordPolicy };
