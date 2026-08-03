// Smoke test for Accounting: record an expense (so there's ledger activity), then
// check the General Ledger for the bank account matches the dashboard balance, post a
// manual journal entry (Owner Drawings) and confirm it lands correctly, then confirm
// an intentionally unbalanced manual entry is rejected.
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

  await fetch(`${base}/api/expenses`, {
    method: 'POST', headers,
    body: JSON.stringify({ expenseDate: '2026-07-23', category: 'Fuel', paidFromAccountCode: '1010', amount: 450, tax: 0, reference: 'FUEL-001' }),
  });

  const accounts = (await (await fetch(`${base}/api/accounting/accounts`, { headers })).json()).accounts;
  const bankAccount = accounts.find((a) => a.code === '1010');
  log('bank account balance from chart of accounts', bankAccount);

  const ledger = await (await fetch(`${base}/api/accounting/ledger/${bankAccount.id}`, { headers })).json();
  log('bank ledger', { lineCount: ledger.lines.length, closingBalance: ledger.closingBalance });

  const dashboard = await (await fetch(`${base}/api/dashboard/summary`, { headers })).json();

  const capitalAccount = accounts.find((a) => a.code === '3000');
  const balanced = await fetch(`${base}/api/accounting/journal-entries`, {
    method: 'POST', headers,
    body: JSON.stringify({
      entryDate: '2026-07-24', reference: 'DRAW-001', description: 'Owner drawing',
      lines: [
        { accountId: capitalAccount.id, debit: 500, credit: 0 },
        { accountId: bankAccount.id, debit: 0, credit: 500 },
      ],
    }),
  });
  const balancedBody = await balanced.json();
  log('manual balanced entry', { status: balanced.status, body: balancedBody });

  const unbalanced = await fetch(`${base}/api/accounting/journal-entries`, {
    method: 'POST', headers,
    body: JSON.stringify({
      entryDate: '2026-07-24', reference: 'BAD-001', description: 'Should fail',
      lines: [
        { accountId: capitalAccount.id, debit: 500, credit: 0 },
        { accountId: bankAccount.id, debit: 0, credit: 400 },
      ],
    }),
  });
  log('manual unbalanced entry (should be rejected)', { status: unbalanced.status, body: await unbalanced.json() });

  const entries = await (await fetch(`${base}/api/accounting/journal-entries`, { headers })).json();
  log('journal entries list (most recent 3)', entries.entries.slice(0, 3));

  const tb = await (await fetch(`${base}/api/reports/trial-balance?asOf=2026-12-31`, { headers })).json();

  const ledgerOk = ledger.closingBalance === bankAccount.balance && bankAccount.balance === dashboard.bankBalance;
  const manualOk = balanced.status === 201;
  const rejectOk = unbalanced.status === 400;
  const tbOk = tb.balanced;

  const ok = ledgerOk && manualOk && rejectOk && tbOk;
  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`Ledger closing balance matches chart-of-accounts balance matches dashboard: ${ledgerOk ? 'OK' : 'MISMATCH'} (${ledger.closingBalance} / ${bankAccount.balance} / ${dashboard.bankBalance})`);
  console.log(`Manual balanced entry accepted (201): ${manualOk ? 'OK' : 'MISMATCH, got ' + balanced.status}`);
  console.log(`Manual unbalanced entry rejected (400): ${rejectOk ? 'OK' : 'MISMATCH, got ' + unbalanced.status}`);
  console.log(`Trial Balance still balanced after manual entry: ${tbOk ? 'OK' : 'NOT BALANCED'}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
