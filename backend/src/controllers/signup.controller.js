const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { ACCESS_SECRET } = require('../middleware/auth');
const { validatePasswordAgainstPolicy } = require('../utils/passwordPolicy');
const { seedChartOfAccounts } = require('../db/seedAccounts');
const { seedParameters } = require('../db/seedParameters');

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
const SELF_SERVE_USER_LIMIT = 2;
const TRIAL_DAYS = 30;
const VERIFICATION_TOKEN_HOURS = 48;
const RESET_TOKEN_HOURS = 1;

function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return { httpOnly: true, sameSite: isProd ? 'none' : 'lax', secure: isProd };
}

function signTokens(user, companyId) {
  const payload = { sub: user.id, companyId, role: user.role_code || 'administrator', email: user.email };
  const accessToken = jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ sub: user.id }, REFRESH_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Public Sign Up (write-up: "create an account... verification email... setup page").
 * Provisions a placeholder company + its first (Administrator) user immediately, since
 * users.company_id is NOT NULL -- the "create your company" step the person experiences
 * happens in completeSetup() right after email verification, which really finishes/
 * renames this placeholder rather than inserting a brand-new row later. Self-serve
 * companies are capped at 2 users (user_limit, enforced in user.controller.createUser)
 * and can never create a second company -- there's no self-serve endpoint for that, only
 * a Super Administrator can provision additional companies.
 */
async function register(req, res) {
  const { fullName, email, password } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password are required.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const existing = await db.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]);
  if (existing.rows[0]) return res.status(409).json({ error: 'An account with that email already exists.' });

  const companyId = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const trialExpires = addDays(today, TRIAL_DAYS);
  await db.query(
    `INSERT INTO companies (id, name, currency, brand_accent_color, self_serve, setup_completed, plan_name, user_limit, license_activated_at, license_expires_at)
     VALUES ($1,$2,'GHS','indigo',true,false,$3,$4,$5,$6)`,
    [companyId, `${fullName.trim()}'s Company`, 'Free Trial (30 days)', SELF_SERVE_USER_LIMIT, today, trialExpires]
  );

  const adminRole = await db.query(`SELECT id FROM roles WHERE code = 'administrator'`, []);
  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const verificationToken = crypto.randomBytes(24).toString('hex');
  const verificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_HOURS * 60 * 60 * 1000).toISOString();
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || nameParts[0];

  await db.query(
    `INSERT INTO users (id, company_id, email, password_hash, full_name, first_name, last_name, role_id, email_verified, verification_token, verification_token_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10)`,
    [userId, companyId, email, passwordHash, fullName.trim(), firstName, lastName, adminRole.rows[0].id, verificationToken, verificationExpires]
  );
  await db.query(`INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2)`, [userId, companyId]);

  // Stubbed email delivery: no provider is configured yet, so the verification link is
  // returned directly instead of emailed. Swap this for a real send (SendGrid, Postmark,
  // SMTP, ...) and drop `verificationUrl` from the response once one is wired in.
  const verificationUrl = `/verify?token=${verificationToken}`;
  console.log(`[stub email] Verify ${email}: ${verificationUrl}`);

  res.status(201).json({ ok: true, email, verificationUrl });
}

/**
 * Verify Email — mirrors login()'s token issuance so clicking the link drops the person
 * straight into the app (write-up: "...sends you straight to the software on a setup
 * page"), landing on the company-setup wizard if it hasn't been completed yet.
 */
async function verifyEmail(req, res) {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Verification token is required.' });

  const result = await db.query(
    `SELECT u.*, r.code as role_code, r.name as role_name, c.name as company_name, c.setup_completed
     FROM users u JOIN roles r ON r.id = u.role_id JOIN companies c ON c.id = u.company_id
     WHERE u.verification_token = $1 LIMIT 1`,
    [token]
  );
  const user = result.rows[0];
  if (!user) return res.status(400).json({ error: 'This verification link is invalid or has already been used.' });
  if (user.verification_token_expires_at && new Date(user.verification_token_expires_at) < new Date()) {
    return res.status(400).json({ error: 'This verification link has expired. Please sign up again.' });
  }

  await db.query(`UPDATE users SET email_verified = true, verification_token = NULL, verification_token_expires_at = NULL WHERE id = $1`, [user.id]);

  const { accessToken, refreshToken } = signTokens(user, user.company_id);
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await db.query(`UPDATE users SET refresh_token_hash = $1 WHERE id = $2`, [refreshTokenHash, user.id]);
  res.cookie('chronobooks_refresh', refreshToken, { ...refreshCookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000 });

  res.json({
    accessToken,
    user: {
      id: user.id, fullName: user.full_name, email: user.email, role: user.role_code, roleName: user.role_name,
      companyId: user.company_id, companyName: user.company_name,
    },
    needsSetup: !user.setup_completed,
  });
}

/**
 * Company Setup wizard (write-up: "...asking you to create your company and link you
 * to it as an administrator"). Finalizes the placeholder company from register() with
 * real details, then seeds its chart of accounts and Head Office branch -- the same
 * post-creation steps system.controller.createCompany runs for admin-provisioned
 * companies. Only reachable once (guarded by setup_completed).
 */
async function completeSetup(req, res) {
  const { companyId, sub: userId } = req.user;
  const { companyName, currency, country, industry, companyType } = req.body;
  if (!companyName) return res.status(400).json({ error: 'Company name is required.' });

  const existing = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = existing.rows[0];
  if (!company) return res.status(404).json({ error: 'Company not found.' });
  if (company.setup_completed) return res.status(400).json({ error: 'Company setup has already been completed.' });

  await db.query(
    `UPDATE companies SET name = $1, currency = $2, country = $3, industry = $4, company_type = $5, setup_completed = true WHERE id = $6`,
    [companyName, currency || company.currency, country || null, industry || null, companyType || null, companyId]
  );

  await seedChartOfAccounts(companyId);
  await seedParameters(companyId);

  const branchId = crypto.randomUUID();
  await db.query(`INSERT INTO branches (id, company_id, name, is_head_office) VALUES ($1,$2,'Head Office',true)`, [branchId, companyId]);
  await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1,$2)`, [userId, branchId]);

  res.json({ ok: true, companyName });
}

/**
 * Forgot Password — stubbed the same way as sign-up verification: no email provider is
 * wired up, so the reset link is returned directly in the response instead of emailed.
 * When no account matches, still returns ok (just without a resetUrl) rather than a 404,
 * so the endpoint can't be used to test which emails have accounts.
 */
async function requestPasswordReset(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const result = await db.query(`SELECT id FROM users WHERE email = $1 ORDER BY created_at DESC LIMIT 1`, [email]);
  const user = result.rows[0];
  if (!user) return res.json({ ok: true });

  const resetToken = crypto.randomBytes(24).toString('hex');
  const resetExpires = new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000).toISOString();
  await db.query(`UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3`, [resetToken, resetExpires, user.id]);

  const resetUrl = `/reset-password?token=${resetToken}`;
  console.log(`[stub email] Password reset for ${email}: ${resetUrl}`);
  res.json({ ok: true, resetUrl });
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required.' });

  const result = await db.query(`SELECT * FROM users WHERE reset_token = $1 LIMIT 1`, [token]);
  const user = result.rows[0];
  if (!user) return res.status(400).json({ error: 'This reset link is invalid or has already been used.' });
  if (user.reset_token_expires_at && new Date(user.reset_token_expires_at) < new Date()) {
    return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
  }

  const policyError = await validatePasswordAgainstPolicy(newPassword, user.company_id);
  if (policyError) return res.status(400).json({ error: policyError });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.query(
    `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL, refresh_token_hash = NULL WHERE id = $2`,
    [passwordHash, user.id]
  );
  res.json({ ok: true });
}

module.exports = { register, verifyEmail, completeSetup, requestPasswordReset, resetPassword };
