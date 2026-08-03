// Smoke test for Settings: login -> read company profile -> update name/brand color as
// Administrator -> confirm it persisted -> confirm the update is rejected for a
// non-administrator role (role gating actually works, not just present in the code).
require('dotenv').config();
const app = require('./src/app');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

function log(label, data) {
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const loginBody = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo-sme.com', password: 'ChronoBooks!123' }),
  })).json();
  const adminHeaders = { Authorization: `Bearer ${loginBody.accessToken}`, 'Content-Type': 'application/json' };

  const before = await (await fetch(`${base}/api/company`, { headers: adminHeaders })).json();
  log('company before', before);

  const updateRes = await fetch(`${base}/api/company`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ ...before, name: 'Kofi Trading Co', brandAccentColor: 'emerald' }),
  });
  log('update as administrator', { status: updateRes.status, body: await updateRes.json() });
  if (!updateRes.ok) throw new Error('Administrator update failed');

  const after = await (await fetch(`${base}/api/company`, { headers: adminHeaders })).json();
  log('company after', after);

  // Create a cashier user directly in the DB (no signup endpoint yet) and confirm they're blocked.
  const cashierRole = (await db.query(`SELECT id FROM roles WHERE code = 'cashier'`, [])).rows[0];
  const cashierId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash('CashierPass!1', 10);
  await db.query(
    `INSERT INTO users (id, company_id, email, password_hash, full_name, role_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [cashierId, before.id, 'cashier@demo-sme.com', passwordHash, 'Demo Cashier', cashierRole.id]
  );

  const cashierLogin = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'cashier@demo-sme.com', password: 'CashierPass!1' }),
  })).json();
  const cashierHeaders = { Authorization: `Bearer ${cashierLogin.accessToken}`, 'Content-Type': 'application/json' };

  const blockedRes = await fetch(`${base}/api/company`, {
    method: 'PUT',
    headers: cashierHeaders,
    body: JSON.stringify({ ...after, name: 'Should Not Save' }),
  });
  log('update as cashier (should be blocked)', { status: blockedRes.status, body: await blockedRes.json() });

  const nameOk = after.name === 'Kofi Trading Co' && after.brandAccentColor === 'emerald';
  const roleGateOk = blockedRes.status === 403;

  console.log(`\n== RESULT: ${nameOk && roleGateOk ? 'PASS' : 'FAIL'} ==`);
  console.log(`Company name updated to "Kofi Trading Co" and brand to "emerald": ${nameOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Cashier blocked from editing company (expected 403): ${roleGateOk ? 'OK' : 'MISMATCH, got ' + blockedRes.status}`);

  server.close();
  await db.end();
  process.exit(nameOk && roleGateOk ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
