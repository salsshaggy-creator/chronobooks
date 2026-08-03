// One-shot in-process smoke test: starts the real Express app on an ephemeral port,
// exercises login -> dashboard -> create expense -> dashboard again, and prints the
// results. Not part of the shipped app — a verification script for this sandbox where
// backgrounding a separate server process across tool calls isn't reliable.
require('dotenv').config();
const app = require('./src/app');

function log(label, data) {
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(data, null, 2));
}

// Dated "today" rather than a fixed string -- the monthly KPIs this script checks are
// computed against the real current month, so a hardcoded date silently breaks this
// assertion the moment wall-clock time crosses into a new month.
const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo-sme.com', password: 'ChronoBooks!123' }),
  });
  const loginBody = await loginRes.json();
  log('login', { status: loginRes.status, body: loginBody });
  if (!loginRes.ok) throw new Error('Login failed');
  const token = loginBody.accessToken;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const dashBefore = await (await fetch(`${base}/api/dashboard/summary`, { headers })).json();
  log('dashboard before expense', dashBefore);

  const expenseRes = await fetch(`${base}/api/expenses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      expenseDate: today(),
      category: 'Fuel',
      paidFromAccountCode: '1010',
      amount: 450,
      tax: 0,
      reference: 'FUEL-001',
      description: 'Fuel for delivery van',
    }),
  });
  const expenseBody = await expenseRes.json();
  log('create expense', { status: expenseRes.status, body: expenseBody });
  if (!expenseRes.ok) throw new Error('Expense creation failed');

  const dashAfter = await (await fetch(`${base}/api/dashboard/summary`, { headers })).json();
  log('dashboard after expense', dashAfter);

  const expensesList = await (await fetch(`${base}/api/expenses`, { headers })).json();
  log('expenses list', expensesList);

  const expectedBankBalance = 25000 - 450;
  const ok = dashAfter.bankBalance === expectedBankBalance && dashAfter.monthlyExpenses === 450;
  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`Expected bank balance ${expectedBankBalance}, got ${dashAfter.bankBalance}`);
  console.log(`Expected monthly expenses 450, got ${dashAfter.monthlyExpenses}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
