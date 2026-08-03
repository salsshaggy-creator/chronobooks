/**
 * Emergency password reset — for when you're locked out and there's no other way in
 * (e.g. the super admin account, which never appears in any company's Users screen).
 *
 * Usage:
 *   node reset-password-tool.js <email> <newPassword>
 *
 * IMPORTANT: never type a new password directly into the `password_hash` column in a
 * database browser — that column must hold a bcrypt hash, not plain text. Doing so is
 * exactly what breaks login (bcrypt compares the stored hash against the password you
 * type at the login screen, and a plain-text value will never match). This script does
 * the hashing correctly and updates the row for you.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

async function main() {
  const [, , email, newPassword] = process.argv;
  if (!email || !newPassword) {
    console.error('Usage: node reset-password-tool.js <email> <newPassword>');
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error('New password must be at least 8 characters.');
    process.exit(1);
  }

  const result = await db.query(`SELECT id, email, company_id FROM users WHERE email = $1`, [email]);
  if (result.rows.length === 0) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }
  if (result.rows.length > 1) {
    console.log(`Note: ${result.rows.length} accounts share this email across different companies (likely from running "npm run seed" more than once without deleting the old database first). Updating all of them.`);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  for (const row of result.rows) {
    await db.query(`UPDATE users SET password_hash = $1, refresh_token_hash = NULL WHERE id = $2`, [passwordHash, row.id]);
  }

  console.log(`Password updated for ${email}. You can log in now with the new password.`);
  await db.end();
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
