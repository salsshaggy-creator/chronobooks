// Smoke test for Banking: add a second bank account, deposit cash, withdraw cash,
// transfer between the two accounts, record a bank charge and interest earned, then
// confirm every account balance and the dashboard total are correct, and that the
// Trial Balance still sums to zero after all of it.
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

  const accountsBefore = (await (await fetch(`${base}/api/bank-accounts`, { headers })).json()).bankAccounts;
  log('bank accounts before', accountsBefore);
  const mainAccount = accountsBefore[0];

  const newAccountRes = await fetch(`${base}/api/bank-accounts`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: 'Savings Account', bankName: 'Fidelity Bank', accountNumber: '0099887766', openingBalance: 5000 }),
  });
  const newAccountBody = await newAccountRes.json();
  log('created second bank account', { status: newAccountRes.status, body: newAccountBody });
  if (!newAccountRes.ok) throw new Error('Bank account creation failed');

  const today = '2026-07-24';

  await fetch(`${base}/api/bank-accounts/deposit`, { method: 'POST', headers, body: JSON.stringify({ bankAccountId: mainAccount.id, amount: 1000, date: today, reference: 'DEP-001' }) });
  await fetch(`${base}/api/bank-accounts/withdraw`, { method: 'POST', headers, body: JSON.stringify({ bankAccountId: mainAccount.id, amount: 200, date: today, reference: 'WD-001' }) });
  await fetch(`${base}/api/bank-accounts/transfer`, { method: 'POST', headers, body: JSON.stringify({ fromBankAccountId: mainAccount.id, toBankAccountId: newAccountBody.id, amount: 3000, date: today, reference: 'TRF-001' }) });
  await fetch(`${base}/api/bank-accounts/charge`, { method: 'POST', headers, body: JSON.stringify({ bankAccountId: mainAccount.id, amount: 25, date: today, reference: 'CHG-001' }) });
  await fetch(`${base}/api/bank-accounts/interest`, { method: 'POST', headers, body: JSON.stringify({ bankAccountId: newAccountBody.id, amount: 15, date: today, reference: 'INT-001' }) });

  const accountsAfter = (await (await fetch(`${base}/api/bank-accounts`, { headers })).json()).bankAccounts;
  log('bank accounts after', accountsAfter);

  const dashboard = await (await fetch(`${base}/api/dashboard/summary`, { headers })).json();
  log('dashboard', { bankBalance: dashboard.bankBalance, cashOnHand: dashboard.cashOnHand });

  const tb = await (await fetch(`${base}/api/reports/trial-balance?asOf=2026-12-31`, { headers })).json();
  log('trial balance totals', { totalDebit: tb.totalDebit, totalCredit: tb.totalCredit, balanced: tb.balanced });

  // Main: 25000 opening + 1000 deposit - 200 withdraw - 3000 transfer out - 25 charge = 22775
  // Savings: 5000 opening + 3000 transfer in + 15 interest = 8015
  // Cash: -1000 deposit (cash decreases) + 200 withdraw (cash increases) = -800
  const mainAfter = accountsAfter.find((a) => a.id === mainAccount.id);
  const savingsAfter = accountsAfter.find((a) => a.id === newAccountBody.id);
  const expectedMain = 25000 + 1000 - 200 - 3000 - 25;
  const expectedSavings = 5000 + 3000 + 15;
  const expectedTotalBankBalance = expectedMain + expectedSavings;

  const mainOk = mainAfter.balance === expectedMain;
  const savingsOk = savingsAfter.balance === expectedSavings;
  const dashOk = dashboard.bankBalance === expectedTotalBankBalance;
  const cashOk = dashboard.cashOnHand === -800;
  const tbOk = tb.balanced;

  const ok = mainOk && savingsOk && dashOk && cashOk && tbOk;
  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`Main account: expected ${expectedMain}, got ${mainAfter.balance} -> ${mainOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Savings account: expected ${expectedSavings}, got ${savingsAfter.balance} -> ${savingsOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Dashboard bank balance: expected ${expectedTotalBankBalance}, got ${dashboard.bankBalance} -> ${dashOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Cash on hand: expected -800, got ${dashboard.cashOnHand} -> ${cashOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Trial Balance balanced: ${tbOk ? 'OK' : 'NOT BALANCED'}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
