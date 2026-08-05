const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { ACCESS_SECRET } = require('../middleware/auth');
const { validatePasswordAgainstPolicy } = require('../utils/passwordPolicy');

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';

/**
 * In local dev, frontend and backend share a scheme+port-adjacent origin, so a plain
 * `sameSite: 'lax'` cookie works fine. In production, frontend and backend are deployed
 * as two separate Railway services on two different subdomains -- a cross-site fetch, so
 * the cookie needs `SameSite=None` (which itself requires `Secure`) or the browser will
 * silently drop it and every refresh/logout call will look like the user's logged out.
 */
function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
  };
}

function signTokens(user, companyId) {
  const payload = { sub: user.id, companyId, role: user.role_code, email: user.email };
  const accessToken = jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ sub: user.id }, REFRESH_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken };
}

/** Login History (write-up Users > Login History) — every attempt is recorded, success or failure, so a Security tab can show who's been trying to get in. */
async function recordLoginAttempt({ email, success, reason, userId, companyId, req }) {
  await db.query(
    `INSERT INTO login_history (user_id, company_id, email, success, reason, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId || null, companyId || null, email, success ? '1' : '0', reason || null, req.ip || null, req.headers['user-agent'] || null]
  );
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const result = await db.query(
    `SELECT u.*, r.code as role_code, r.name as role_name, c.name as company_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN companies c ON c.id = u.company_id
     WHERE u.email = $1 LIMIT 1`,
    [email]
  );
  const user = result.rows[0];
  if (!user) {
    await recordLoginAttempt({ email, success: false, reason: 'No account with that email', req });
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await recordLoginAttempt({ email, success: false, reason: 'Incorrect password', userId: user.id, companyId: user.company_id, req });
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  if (!user.is_active) {
    await recordLoginAttempt({ email, success: false, reason: 'Account locked', userId: user.id, companyId: user.company_id, req });
    return res.status(403).json({ error: 'This account has been locked. Contact your administrator.' });
  }

  if (!user.email_verified) {
    await recordLoginAttempt({ email, success: false, reason: 'Email not verified', userId: user.id, companyId: user.company_id, req });
    return res.status(403).json({ error: 'Please verify your email before signing in. Check your inbox for the verification link.', code: 'EMAIL_NOT_VERIFIED' });
  }

  await recordLoginAttempt({ email, success: true, reason: null, userId: user.id, companyId: user.company_id, req });

  const { accessToken, refreshToken } = signTokens(user, user.company_id);
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await db.query(`UPDATE users SET refresh_token_hash = $1 WHERE id = $2`, [refreshTokenHash, user.id]);

  res.cookie('chronobooks_refresh', refreshToken, {
    ...refreshCookieOptions(),
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.json({
    accessToken,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role_code,
      roleName: user.role_name,
      companyId: user.company_id,
      companyName: user.company_name,
    },
  });
}

/** Reflects the *current* JWT company context, not just the user's home company — important after switch-company. */
async function me(req, res) {
  const result = await db.query(
    `SELECT u.id, u.email, u.full_name, r.code as role_code, r.name as role_name
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 LIMIT 1`,
    [req.user.sub]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'User not found.' });

  const companyRes = await db.query(`SELECT id, name FROM companies WHERE id = $1`, [req.user.companyId]);
  const company = companyRes.rows[0];

  res.json({
    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role_code,
      roleName: row.role_name,
      companyId: company ? company.id : req.user.companyId,
      companyName: company ? company.name : null,
    },
  });
}

/** Companies this user can switch into — every company for a Super Administrator, otherwise whatever's in user_companies. */
async function listMyCompanies(req, res) {
  if (req.user.role === 'super_administrator') {
    const all = await db.query(`SELECT id, name FROM companies ORDER BY name`, []);
    return res.json({ companies: all.rows });
  }
  const result = await db.query(
    `SELECT c.id, c.name FROM user_companies uc JOIN companies c ON c.id = uc.company_id WHERE uc.user_id = $1 ORDER BY c.name`,
    [req.user.sub]
  );
  res.json({ companies: result.rows });
}

/**
 * Switch Company — re-issues an access token scoped to a different company instead of
 * requiring a fresh login. Every existing controller already reads req.user.companyId,
 * so nothing downstream needs to change to support this.
 */
async function switchCompany(req, res) {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId is required.' });

  if (req.user.role !== 'super_administrator') {
    const access = await db.query(`SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2`, [req.user.sub, companyId]);
    if (!access.rows[0]) return res.status(403).json({ error: "You don't have access to that company." });
  }

  const companyRes = await db.query(`SELECT id, name FROM companies WHERE id = $1`, [companyId]);
  const company = companyRes.rows[0];
  if (!company) return res.status(404).json({ error: 'Company not found.' });

  const userRes = await db.query(
    `SELECT u.*, r.code as role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [req.user.sub]
  );
  const user = userRes.rows[0];

  const { accessToken } = signTokens(user, companyId);

  res.json({
    accessToken,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: req.user.role,
      companyId: company.id,
      companyName: company.name,
    },
  });
}

/**
 * Self-service password change — available to every logged-in user, including the
 * Super Administrator (who never appears in any company's Users screen, so an admin
 * "reset password" action can never reach that account). This is the sanctioned way
 * to change a password; hand-editing `password_hash` in the database will break login,
 * since that column must hold a bcrypt hash, not plain text.
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required.' });

  const policyError = await validatePasswordAgainstPolicy(newPassword, req.user.companyId);
  if (policyError) return res.status(400).json({ error: policyError });

  const result = await db.query(`SELECT * FROM users WHERE id = $1`, [req.user.sub]);
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.query(`UPDATE users SET password_hash = $1, refresh_token_hash = NULL WHERE id = $2`, [passwordHash, user.id]);
  res.json({ ok: true });
}

async function logout(req, res) {
  // Invalidate the stored refresh token hash so the refresh cookie (if it leaked)
  // can no longer be exchanged for a new access token, then clear the cookie itself.
  await db.query(`UPDATE users SET refresh_token_hash = NULL WHERE id = $1`, [req.user.sub]);
  res.clearCookie('chronobooks_refresh', refreshCookieOptions());
  res.json({ ok: true });
}

module.exports = { login, me, logout, listMyCompanies, switchCompany, changePassword };
