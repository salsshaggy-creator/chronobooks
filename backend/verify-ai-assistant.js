// Smoke test for the AI Assistant ("avatar"): free-for-everyone platform-key fallback,
// optional bring-your-own-key override, and the /ai/ask flow — with the real OpenAI
// network call mocked out so this runs offline and deterministically.
require('dotenv').config();

// A platform key must be set before app.js (and therefore ai.controller.js) loads, so
// the "free for everyone" fallback has something to resolve to.
process.env.PLATFORM_OPENAI_API_KEY = 'sk-platform-test-key-000000';

// Mock global.fetch BEFORE requiring the app, so ai.controller.js's calls to the
// OpenAI endpoint resolve through this instead of hitting the real network. Any other
// URL (i.e. the test harness's own calls to our local server) passes through to the
// real fetch.
const realFetch = global.fetch;
let mockMode = 'success';
let lastAuthHeader = null;
global.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.includes('api.openai.com')) {
    lastAuthHeader = opts?.headers?.Authorization || null;
    if (mockMode === 'success') {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ChronoBooks records every invoice as Debit Accounts Receivable / Credit Income automatically.' } }] }), { status: 200 });
    }
    if (mockMode === 'unauthorized') {
      return new Response(JSON.stringify({ error: { message: 'Incorrect API key provided.' } }), { status: 401 });
    }
    if (mockMode === 'network-error') {
      throw new Error('simulated network failure');
    }
  }
  return realFetch(url, opts);
};

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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })).json();

  const adminLogin = await login('admin@demo-sme.com', 'ChronoBooks!123');
  const adminHeaders = { Authorization: `Bearer ${adminLogin.accessToken}`, 'Content-Type': 'application/json' };

  // --- Default state: no company key, but the platform key makes it free & available for everyone ---
  const settingsBefore = await (await fetch(`${base}/api/ai/settings`, { headers: adminHeaders })).json();
  log('AI settings with no company key (platform key covers it)', settingsBefore);
  const freeByDefaultOk = settingsBefore.available === true && settingsBefore.hasKey === false && settingsBefore.usingPlatformKey === true && settingsBefore.freeForEveryone === true;

  // --- Any authenticated user (not just admins) can read settings and ask, with zero setup ---
  const cashierRole = (await db.query(`SELECT id FROM roles WHERE code = 'cashier'`, [])).rows[0];
  const crypto = require('crypto');
  const bcrypt = require('bcryptjs');
  const cashierId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash('CashierPass!1', 10);
  await db.query(
    `INSERT INTO users (id, company_id, email, password_hash, full_name, role_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [cashierId, adminLogin.user.companyId, 'cashier@demo-sme.com', passwordHash, 'Demo Cashier', cashierRole.id]
  );
  const cashierLogin = await login('cashier@demo-sme.com', 'CashierPass!1');
  const cashierHeaders = { Authorization: `Bearer ${cashierLogin.accessToken}`, 'Content-Type': 'application/json' };

  const cashierSettings = await fetch(`${base}/api/ai/settings`, { headers: cashierHeaders });
  const cashierAskNoSetup = await fetch(`${base}/api/ai/ask`, {
    method: 'POST', headers: cashierHeaders,
    body: JSON.stringify({ messages: [{ role: 'user', content: 'How does ChronoBooks record an invoice?' }] }),
  });
  const cashierAskBody = await cashierAskNoSetup.json();
  log('cashier (non-admin) asks with zero setup', { settingsStatus: cashierSettings.status, askStatus: cashierAskNoSetup.status, reply: cashierAskBody.reply, usedAuth: lastAuthHeader });
  const anyoneCanAskOk = cashierSettings.status === 200 && cashierAskNoSetup.status === 200 && typeof cashierAskBody.reply === 'string' && lastAuthHeader === 'Bearer sk-platform-test-key-000000';

  // --- Only an admin can change settings (add/remove a company-specific key) ---
  const cashierBlockedFromChange = await fetch(`${base}/api/ai/settings`, {
    method: 'PUT', headers: cashierHeaders, body: JSON.stringify({ apiKey: 'sk-should-not-be-allowed' }),
  });
  log('cashier blocked from changing settings (expect 403)', { status: cashierBlockedFromChange.status });
  const adminOnlyWriteOk = cashierBlockedFromChange.status === 403;

  // --- Admin adds a company-specific key -> that key is used instead of the platform one ---
  const saveKey = await fetch(`${base}/api/ai/settings`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ apiKey: 'sk-company-own-key-abcdef', model: 'gpt-4o-mini' }),
  });
  const settingsAfterKey = await (await fetch(`${base}/api/ai/settings`, { headers: adminHeaders })).json();
  await fetch(`${base}/api/ai/ask`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
  });
  log('after company adds its own key', { saveStatus: saveKey.status, settingsAfterKey, usedAuth: lastAuthHeader });
  const ownKeyUsedOk = saveKey.status === 200 && settingsAfterKey.hasKey === true && settingsAfterKey.usingPlatformKey === false
    && settingsAfterKey.maskedKey && !settingsAfterKey.maskedKey.includes('own-key-abcdef')
    && lastAuthHeader === 'Bearer sk-company-own-key-abcdef';

  // --- A rejected key surfaces a clear 401 ---
  mockMode = 'unauthorized';
  const askRejected = await fetch(`${base}/api/ai/ask`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
  });
  log('ask with a key OpenAI rejects (expect 401)', { status: askRejected.status });
  const rejectedKeyOk = askRejected.status === 401;

  // --- A network failure surfaces a clear 502, not a crash ---
  mockMode = 'network-error';
  const askNetworkFail = await fetch(`${base}/api/ai/ask`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
  });
  log('ask when OpenAI is unreachable (expect 502)', { status: askNetworkFail.status });
  const networkFailOk = askNetworkFail.status === 502;
  mockMode = 'success';

  // --- Removing the company key falls back to the free platform key again ---
  const clearRes = await fetch(`${base}/api/ai/settings`, { method: 'DELETE', headers: adminHeaders });
  const settingsAfterClear = await (await fetch(`${base}/api/ai/settings`, { headers: adminHeaders })).json();
  await fetch(`${base}/api/ai/ask`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
  });
  log('after removing the company key', { clearStatus: clearRes.status, settingsAfterClear, usedAuth: lastAuthHeader });
  const fallsBackOk = clearRes.status === 200 && settingsAfterClear.hasKey === false && settingsAfterClear.usingPlatformKey === true
    && lastAuthHeader === 'Bearer sk-platform-test-key-000000';

  const allOk = freeByDefaultOk && anyoneCanAskOk && adminOnlyWriteOk && ownKeyUsedOk && rejectedKeyOk && networkFailOk && fallsBackOk;

  console.log(`\n== RESULT: ${allOk ? 'PASS' : 'FAIL'} ==`);
  console.log(`Free for everyone by default via the platform key: ${freeByDefaultOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Any authenticated user can ask with zero setup: ${anyoneCanAskOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Only an admin can change the key/model: ${adminOnlyWriteOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Company's own key overrides the platform key once added: ${ownKeyUsedOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Rejected key surfaces 401: ${rejectedKeyOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Network failure surfaces 502, not a crash: ${networkFailOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Removing the company key falls back to the platform key: ${fallsBackOk ? 'OK' : 'MISMATCH'}`);

  server.close();
  await db.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
