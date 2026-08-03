const db = require('../config/db');

/**
 * Password Policy (write-up Security section) — each company can configure a minimum
 * length and character-class requirements; every place a password gets set (self-service
 * change, admin reset, new user creation) checks against the *acting company's* policy
 * rather than a single hardcoded rule.
 */
async function validatePasswordAgainstPolicy(password, companyId) {
  const result = await db.query(
    `SELECT password_min_length, password_require_uppercase, password_require_number, password_require_symbol FROM companies WHERE id = $1`,
    [companyId]
  );
  const policy = result.rows[0] || { password_min_length: 8 };
  const minLength = policy.password_min_length || 8;

  if (!password || password.length < minLength) {
    return `Password must be at least ${minLength} characters.`;
  }
  if (policy.password_require_uppercase && !/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (policy.password_require_number && !/[0-9]/.test(password)) {
    return 'Password must include at least one number.';
  }
  if (policy.password_require_symbol && !/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one symbol.';
  }
  return null;
}

module.exports = { validatePasswordAgainstPolicy };
