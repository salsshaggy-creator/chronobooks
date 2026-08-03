const db = require('../config/db');

/** Full permission catalog, grouped by category, for rendering the checkbox grid. */
async function listPermissions(req, res) {
  const result = await db.query(`SELECT id, code, label, category FROM permissions ORDER BY category, label`, []);
  res.json({ permissions: result.rows });
}

/**
 * Super Administrator is a singular, platform-level account — never offered as an
 * assignable role, and only visible in this list to someone who already holds it.
 * "Just like ChronoSync": the platform owner role is kept separate from every
 * company's own role/user management.
 */
async function listRoles(req, res) {
  const result = await db.query(`SELECT id, code, name FROM roles ORDER BY name`, []);
  const roles = req.user.role === 'super_administrator'
    ? result.rows
    : result.rows.filter((r) => r.code !== 'super_administrator');
  res.json({ roles });
}

/** Which permissions a given role currently has — used to pre-check the grid for that role. */
async function getRolePermissions(req, res) {
  const { roleId } = req.params;
  const result = await db.query(`SELECT permission_id FROM role_permissions WHERE role_id = $1`, [roleId]);
  res.json({ permissionIds: result.rows.map((r) => r.permission_id) });
}

/**
 * Role Management (write-up Section 5) — instead of hard-coded permissions, an
 * Administrator/Super Administrator can change what a role is allowed to do here.
 * Note: this updates the permission *catalog* (metadata + a foundation other modules
 * can read later); the handful of security-critical routes ChronoBooks already gates
 * server-side (company edit, manual journal entries, payroll import) keep using their
 * existing requireRole() checks regardless of what's saved here.
 */
async function setRolePermissions(req, res) {
  const { roleId } = req.params;
  const { permissionIds } = req.body;
  if (!Array.isArray(permissionIds)) return res.status(400).json({ error: 'permissionIds must be an array.' });

  const role = await db.query(`SELECT code FROM roles WHERE id = $1`, [roleId]);
  if (!role.rows[0]) return res.status(404).json({ error: 'Role not found.' });
  if (role.rows[0].code === 'super_administrator') {
    return res.status(400).json({ error: "The Super Administrator role always has full access and can't be edited." });
  }

  await db.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
  for (const permissionId of permissionIds) {
    await db.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)`, [roleId, permissionId]);
  }
  res.json({ ok: true });
}

module.exports = { listPermissions, listRoles, getRolePermissions, setRolePermissions };
