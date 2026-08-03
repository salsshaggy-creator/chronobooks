/**
 * One-off recovery tool: sets the Super Administrator account's email and password in
 * one step, no matter what state the row is currently in (works even if the password
 * hash was hand-edited into something invalid). Finds the account by role, not by its
 * current email, so it's safe to run regardless of what's already there.
 *
 * Usage:
 *   node claim-superadmin-tool.js <newEmail> <newPassword>
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

async function main() {
  const [, , newEmail, newPassword] = process.argv;
  if (!newEmail || !newPassword) {
    console.error('Usage: node claim-superadmin-tool.js <newEmail> <newPassword>');
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error('New password must be at least 8 characters.');
    process.exit(1);
  }

  const result = await db.query(
    `SELECT u.id, u.email FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'super_administrator'`,
    []
  );
  if (result.rows.length === 0) {
    console.error('No Super Administrator account found. Run "npm run seed" first.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  for (const row of result.rows) {
    await db.query(`UPDATE users SET email = $1, password_hash = $2, refresh_token_hash = NULL WHERE id = $3`, [newEmail, passwordHash, row.id]);
    console.log(`Updated Super Administrator account (was: ${row.email}) -> ${newEmail}`);
  }

  console.log(`Done. Log in with ${newEmail} and your new password.`);
  await db.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
