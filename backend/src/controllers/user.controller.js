const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { validatePasswordAgainstPolicy } = require('../utils/passwordPolicy');

async function listUsers(req, res) {
  const { companyId } = req.user;
  // The Super Administrator is a platform-level account, homed on a company only to
  // satisfy the NOT NULL constraint — it never shows up as one of "that company's
  // users" (write-up: Company Administrators manage their own company's users only).
  const result = await db.query(
    `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.username, u.phone,
            u.employee_number, u.is_active, r.id as role_id, r.code as role_code, r.name as role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.company_id = $1 AND r.code != 'super_administrator'
     ORDER BY u.full_name`,
    [companyId]
  );

  const branchesRes = await db.query(
    `SELECT ub.user_id, b.id, b.name FROM user_branches ub JOIN branches b ON b.id = ub.branch_id
     JOIN users u ON u.id = ub.user_id WHERE u.company_id = $1`,
    [companyId]
  );
  const deptsRes = await db.query(
    `SELECT ud.user_id, d.id, d.name FROM user_departments ud JOIN departments d ON d.id = ud.department_id
     JOIN users u ON u.id = ud.user_id WHERE u.company_id = $1`,
    [companyId]
  );

  const users = result.rows.map((u) => ({
    ...u,
    branches: branchesRes.rows.filter((b) => b.user_id === u.id).map((b) => ({ id: b.id, name: b.name })),
    departments: deptsRes.rows.filter((d) => d.user_id === u.id).map((d) => ({ id: d.id, name: d.name })),
  }));

  res.json({ users });
}

async function listRoles(req, res) {
  const result = await db.query(`SELECT id, code, name FROM roles ORDER BY name`, []);
  res.json({ roles: result.rows });
}

/**
 * Create User (write-up Section 4) — replaces the old "read-only list" with a real
 * onboarding form: identity, login, role assignment, and branch/department access.
 */
async function assertAssignableRole(req, roleId) {
  const roleRes = await db.query(`SELECT code FROM roles WHERE id = $1`, [roleId]);
  const role = roleRes.rows[0];
  if (!role) {
    const err = new Error('Role not found.');
    err.status = 404;
    throw err;
  }
  if (role.code === 'super_administrator' && req.user.role !== 'super_administrator') {
    const err = new Error("Super Administrator can't be assigned through user management — it's a single platform-level account.");
    err.status = 403;
    throw err;
  }
}

async function createUser(req, res) {
  const { companyId } = req.user;
  const {
    firstName, lastName, username, email, phone, employeeNumber,
    password, roleId, isActive, branchIds, departmentIds,
  } = req.body;

  if (!firstName || !lastName || !email || !password || !roleId) {
    return res.status(400).json({ error: 'First name, last name, email, password, and role are required.' });
  }
  const policyError = await validatePasswordAgainstPolicy(password, companyId);
  if (policyError) return res.status(400).json({ error: policyError });
  await assertAssignableRole(req, roleId);

  const existing = await db.query(`SELECT id FROM users WHERE company_id = $1 AND email = $2`, [companyId, email]);
  if (existing.rows[0]) return res.status(409).json({ error: 'A user with that email already exists in this company.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();
  const fullName = `${firstName} ${lastName}`.trim();

  await db.query(
    `INSERT INTO users (id, company_id, email, password_hash, full_name, first_name, last_name, username, phone, employee_number, role_id, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [userId, companyId, email, passwordHash, fullName, firstName, lastName, username || null, phone || null, employeeNumber || null, roleId, isActive === false ? 0 : 1]
  );

  await db.query(`INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2)`, [userId, companyId]);

  for (const branchId of branchIds || []) {
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1,$2)`, [userId, branchId]);
  }
  for (const departmentId of departmentIds || []) {
    await db.query(`INSERT INTO user_departments (user_id, department_id) VALUES ($1,$2)`, [userId, departmentId]);
  }

  res.status(201).json({ id: userId });
}

async function updateUser(req, res) {
  const { companyId } = req.user;
  const { userId } = req.params;
  const { firstName, lastName, username, phone, employeeNumber, roleId, isActive, branchIds, departmentIds } = req.body;

  const existing = await db.query(`SELECT * FROM users WHERE id = $1 AND company_id = $2`, [userId, companyId]);
  const user = existing.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (roleId) await assertAssignableRole(req, roleId);

  const fullName = firstName || lastName ? `${firstName ?? user.first_name} ${lastName ?? user.last_name}`.trim() : user.full_name;

  await db.query(
    `UPDATE users SET first_name=$1, last_name=$2, full_name=$3, username=$4, phone=$5, employee_number=$6, role_id=$7, is_active=$8 WHERE id=$9`,
    [
      firstName ?? user.first_name, lastName ?? user.last_name, fullName,
      username ?? user.username, phone ?? user.phone, employeeNumber ?? user.employee_number,
      roleId ?? user.role_id, isActive === undefined ? user.is_active : (isActive ? 1 : 0),
      userId,
    ]
  );

  if (branchIds) {
    await db.query(`DELETE FROM user_branches WHERE user_id = $1`, [userId]);
    for (const branchId of branchIds) await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1,$2)`, [userId, branchId]);
  }
  if (departmentIds) {
    await db.query(`DELETE FROM user_departments WHERE user_id = $1`, [userId]);
    for (const departmentId of departmentIds) await db.query(`INSERT INTO user_departments (user_id, department_id) VALUES ($1,$2)`, [userId, departmentId]);
  }

  res.json({ ok: true });
}

/** Reset Password permission (write-up Section 5, Users category) — an admin-driven reset, not a self-service email flow. */
async function resetPassword(req, res) {
  const { companyId } = req.user;
  const { userId } = req.params;
  const { newPassword } = req.body;
  const policyError = await validatePasswordAgainstPolicy(newPassword, companyId);
  if (policyError) return res.status(400).json({ error: policyError });

  const existing = await db.query(`SELECT id FROM users WHERE id = $1 AND company_id = $2`, [userId, companyId]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'User not found.' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.query(`UPDATE users SET password_hash = $1, refresh_token_hash = NULL WHERE id = $2`, [passwordHash, userId]);
  res.json({ ok: true });
}

/** Lock Users permission — toggles is_active; inactive users are rejected at login. */
async function setActive(req, res) {
  const { companyId } = req.user;
  const { userId } = req.params;
  const { isActive } = req.body;

  const existing = await db.query(`SELECT id FROM users WHERE id = $1 AND company_id = $2`, [userId, companyId]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'User not found.' });

  await db.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [isActive ? 1 : 0, userId]);
  res.json({ ok: true });
}

module.exports = { listUsers, listRoles, createUser, updateUser, resetPassword, setActive };
