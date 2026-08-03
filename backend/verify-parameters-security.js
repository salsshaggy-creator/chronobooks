// Smoke test for Milestone 4 (Parameters + Security): seeded reference data reads,
// creating new parameter rows, password-policy read/update + enforcement, login
// history recording (success and failure), and audit log visibility.
require('dotenv').config();
const app = require('./src/app');
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

  const login = async (email, password) =>
    (await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })).json();

  const adminLogin = await login('admin@demo-sme.com', 'ChronoBooks!123');
  const adminHeaders = { Authorization: `Bearer ${adminLogin.accessToken}`, 'Content-Type': 'application/json' };

  // --- Parameters: seeded data present ---
  const taxCodes = await (await fetch(`${base}/api/parameters/tax-codes`, { headers: adminHeaders })).json();
  const costCentres = await (await fetch(`${base}/api/parameters/cost-centres`, { headers: adminHeaders })).json();
  const paymentTerms = await (await fetch(`${base}/api/parameters/payment-terms`, { headers: adminHeaders })).json();
  const numberSequences = await (await fetch(`${base}/api/parameters/number-sequences`, { headers: adminHeaders })).json();
  const documentTypes = await (await fetch(`${base}/api/parameters/document-types`, { headers: adminHeaders })).json();
  const currencies = await (await fetch(`${base}/api/parameters/currencies`, { headers: adminHeaders })).json();
  log('seeded parameters counts', {
    taxCodes: taxCodes.taxCodes.length,
    costCentres: costCentres.costCentres.length,
    paymentTerms: paymentTerms.paymentTerms.length,
    numberSequences: numberSequences.numberSequences.length,
    documentTypes: documentTypes.documentTypes.length,
    currencies: currencies.currencies.length,
  });
  const seededOk =
    taxCodes.taxCodes.length === 4 &&
    costCentres.costCentres.length === 4 &&
    paymentTerms.paymentTerms.length === 4 &&
    numberSequences.numberSequences.length === 5 &&
    documentTypes.documentTypes.length === 7 &&
    currencies.currencies.length === 5;

  // --- Parameters: create a new tax code, duplicate should 409 ---
  const createTax = await fetch(`${base}/api/parameters/tax-codes`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ code: 'VAT-FLAT', name: 'VAT Flat Rate', rate: 3 }),
  });
  const dupeTax = await fetch(`${base}/api/parameters/tax-codes`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ code: 'VAT-FLAT', name: 'VAT Flat Rate', rate: 3 }),
  });
  log('create tax code / duplicate rejected', { created: createTax.status, dupe: dupeTax.status });
  const taxCreateOk = createTax.status === 201 && dupeTax.status === 409;

  // --- Number sequence update ---
  const seqBefore = numberSequences.numberSequences.find((s) => s.document_type === 'invoice');
  const seqUpdate = await fetch(`${base}/api/parameters/number-sequences/${seqBefore.id}`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ prefix: 'INV-2026-', nextNumber: 50 }),
  });
  const seqAfterList = await (await fetch(`${base}/api/parameters/number-sequences`, { headers: adminHeaders })).json();
  const seqAfter = seqAfterList.numberSequences.find((s) => s.id === seqBefore.id);
  log('number sequence update', { status: seqUpdate.status, seqAfter });
  const seqOk = seqUpdate.status === 200 && seqAfter.prefix === 'INV-2026-' && Number(seqAfter.next_number) === 50;

  // --- Security: password policy read + update ---
  const policyBefore = await (await fetch(`${base}/api/security/password-policy`, { headers: adminHeaders })).json();
  log('password policy before', policyBefore);

  const policyUpdate = await fetch(`${base}/api/security/password-policy`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ minLength: 12, requireUppercase: true, requireNumber: true, requireSymbol: false }),
  });
  const policyAfter = await (await fetch(`${base}/api/security/password-policy`, { headers: adminHeaders })).json();
  log('password policy after', { status: policyUpdate.status, policyAfter });
  const policyOk = policyAfter.minLength === 12 && policyAfter.requireUppercase === true && policyAfter.requireNumber === true;

  // --- Security: policy enforcement on self-service change-password ---
  const weakChange = await fetch(`${base}/api/auth/change-password`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ currentPassword: 'ChronoBooks!123', newPassword: 'short1A' }), // fails min length 12
  });
  const noUpperChange = await fetch(`${base}/api/auth/change-password`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ currentPassword: 'ChronoBooks!123', newPassword: 'alllowercase123' }), // fails uppercase rule
  });
  const strongChange = await fetch(`${base}/api/auth/change-password`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ currentPassword: 'ChronoBooks!123', newPassword: 'NewStrongPass123' }),
  });
  log('policy-enforced password change', { weak: weakChange.status, noUpper: noUpperChange.status, strong: strongChange.status });
  const enforcementOk = weakChange.status === 400 && noUpperChange.status === 400 && strongChange.status === 200;

  // Reset the policy back to defaults so it doesn't affect other verify scripts run later.
  await fetch(`${base}/api/security/password-policy`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ minLength: 8, requireUppercase: false, requireNumber: false, requireSymbol: false }),
  });

  // --- Security: login history recorded for a failed and a successful attempt ---
  await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo-sme.com', password: 'WrongPassword!' }),
  });
  // password was just changed to 'NewStrongPass123' above
  await login('admin@demo-sme.com', 'NewStrongPass123');

  const history = await (await fetch(`${base}/api/security/login-history`, { headers: adminHeaders })).json();
  log('login history (most recent first)', history.entries.slice(0, 3));
  const failedEntry = history.entries.find((e) => !e.success && e.reason === 'Incorrect password');
  const successEntry = history.entries.find((e) => e.success);
  const historyOk = !!failedEntry && !!successEntry;

  // --- Security: audit log endpoint reachable (table already populated by other modules) ---
  const auditLog = await fetch(`${base}/api/security/audit-log`, { headers: adminHeaders });
  const auditLogOk = auditLog.status === 200;
  log('audit log status', { status: auditLog.status });

  // --- Super Administrator can edit currencies; a company administrator cannot ---
  const superLogin = await login('salsshaggy@gmail.com', 'ChronoBooks!SuperAdmin1');
  const superHeaders = { Authorization: `Bearer ${superLogin.accessToken}`, 'Content-Type': 'application/json' };
  const currencyBlocked = await fetch(`${base}/api/parameters/currencies/USD`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ name: 'US Dollar (edited)' }),
  });
  const currencyAllowed = await fetch(`${base}/api/parameters/currencies/USD`, {
    method: 'PUT', headers: superHeaders,
    body: JSON.stringify({ name: 'US Dollar (edited)' }),
  });
  log('currency edit gating', { companyAdmin: currencyBlocked.status, superAdmin: currencyAllowed.status });
  const currencyGateOk = currencyBlocked.status === 403 && currencyAllowed.status === 200;

  const allOk = seededOk && taxCreateOk && seqOk && policyOk && enforcementOk && historyOk && auditLogOk && currencyGateOk;

  console.log(`\n== RESULT: ${allOk ? 'PASS' : 'FAIL'} ==`);
  console.log(`Parameters seeded correctly: ${seededOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Tax code create + duplicate 409: ${taxCreateOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Number sequence update: ${seqOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Password policy read/update: ${policyOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Password policy enforcement on change-password: ${enforcementOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Login history recorded failure + success: ${historyOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Audit log endpoint reachable: ${auditLogOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Currency edit gated to super admin only: ${currencyGateOk ? 'OK' : 'MISMATCH'}`);

  server.close();
  await db.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
