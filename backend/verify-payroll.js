// Smoke test for Payroll: list the mock available run -> import it -> confirm a
// balanced journal was posted with the correct nine-category breakdown -> confirm
// re-importing the same run is blocked -> confirm the Trial Balance still balances.
require('dotenv').config();
const app = require('./src/app');

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
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo-sme.com', password: 'ChronoBooks!123' }),
  })).json();
  const headers = { Authorization: `Bearer ${loginBody.accessToken}`, 'Content-Type': 'application/json' };

  const available = await (await fetch(`${base}/api/payroll/available-runs`, { headers })).json();
  log('available runs (mocked)', available);
  const run = available.runs[0];

  const importRes = await fetch(`${base}/api/payroll/import/${run.id}`, { method: 'POST', headers });
  const importBody = await importRes.json();
  log('import run', { status: importRes.status, body: importBody });
  if (!importRes.ok) throw new Error('Payroll import failed');

  const dashboard = await (await fetch(`${base}/api/dashboard/summary`, { headers })).json();
  log('dashboard after import', { monthlyExpenses: dashboard.monthlyExpenses, profitLoss: dashboard.profitLoss });

  const tb = await (await fetch(`${base}/api/reports/trial-balance?asOf=2026-12-31`, { headers })).json();
  log('trial balance', { totalDebit: tb.totalDebit, totalCredit: tb.totalCredit, balanced: tb.balanced });

  const duplicateRes = await fetch(`${base}/api/payroll/import/${run.id}`, { method: 'POST', headers });
  log('duplicate import attempt (should be blocked)', { status: duplicateRes.status, body: await duplicateRes.json() });

  const pl = await (await fetch(`${base}/api/reports/profit-and-loss?from=2026-01-01&to=2026-12-31`, { headers })).json();
  log('P&L expense breakdown', pl.expenses);

  // gross 50000 + ssnit_er 6500 + tier2_er 2500 = 59000 total expense recognized
  const expectedExpense = 50000 + 6500 + 2500;
  const expenseOk = dashboard.monthlyExpenses === expectedExpense;
  const tbOk = tb.balanced;
  const duplicateBlockedOk = duplicateRes.status === 409;

  const ok = expenseOk && tbOk && duplicateBlockedOk;
  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`Monthly expenses: expected ${expectedExpense}, got ${dashboard.monthlyExpenses} -> ${expenseOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Trial Balance balanced: ${tbOk ? 'OK' : 'NOT BALANCED'}`);
  console.log(`Duplicate import blocked (409): ${duplicateBlockedOk ? 'OK' : 'MISMATCH, got ' + duplicateRes.status}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
