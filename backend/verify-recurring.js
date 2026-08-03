// Smoke test for Recurring Transactions: creating an invoice/bill/expense template, the
// "Inventory category blocked" validation, catch-up posting of multiple missed
// occurrences in one run, calendar-correct month-end clamping (Jan 31 -> Feb 28, not
// "Mar 3"), pausing stopping future runs, run history, and the role gate.
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

  const login = async (email, password) =>
    (await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })).json();

  const adminLogin = await login('admin@demo-sme.com', 'ChronoBooks!123');
  const headers = { Authorization: `Bearer ${adminLogin.accessToken}`, 'Content-Type': 'application/json' };

  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ recurringTransactionsEnabled: true }) });

  const customer = (await (await fetch(`${base}/api/customers`, { headers })).json()).customers[0];
  const supplier = (await (await fetch(`${base}/api/suppliers`, { headers })).json()).suppliers[0];

  // 1. A recurring bill can't be set to "Inventory" (no unattended stock receipts).
  const badBillRes = await fetch(`${base}/api/recurring`, {
    method: 'POST', headers,
    body: JSON.stringify({ type: 'bill', name: 'Bad', frequency: 'monthly', startDate: '2026-01-01', payload: { supplierId: supplier.id, expenseCategory: 'Inventory', lines: [{ description: 'x', quantity: 1, unitPrice: 1 }] } }),
  });
  const inventoryCategoryBlockedOk = badBillRes.status === 400;
  log('inventory category blocked', { status: badBillRes.status });

  // 2. Create the three recurring transactions. Rent starts on Jan 31 specifically to
  // exercise month-end clamping when it advances to February.
  const rentRes = await fetch(`${base}/api/recurring`, {
    method: 'POST', headers,
    body: JSON.stringify({ type: 'expense', name: 'Monthly office rent', frequency: 'monthly', startDate: '2026-01-31', payload: { category: 'Rent', paidFromAccountCode: '1010', amount: 500 } }),
  });
  const rent = await rentRes.json();

  const retainerRes = await fetch(`${base}/api/recurring`, {
    method: 'POST', headers,
    body: JSON.stringify({ type: 'invoice', name: 'Monthly retainer', frequency: 'monthly', startDate: '2026-01-15', payload: { customerId: customer.id, incomeCategory: 'Sales', lines: [{ description: 'Retainer', quantity: 1, unitPrice: 1000 }] } }),
  });
  const retainer = await retainerRes.json();

  const fuelRes = await fetch(`${base}/api/recurring`, {
    method: 'POST', headers,
    body: JSON.stringify({ type: 'bill', name: 'Weekly fuel', frequency: 'weekly', startDate: '2026-01-05', payload: { supplierId: supplier.id, expenseCategory: 'Fuel', lines: [{ description: 'Fuel', quantity: 1, unitPrice: 50 }] } }),
  });
  const fuel = await fuelRes.json();

  const createdOk = rentRes.ok && retainerRes.ok && fuelRes.ok && !!rent.id && !!retainer.id && !!fuel.id;
  log('created three recurring transactions', { rent, retainer, fuel, createdOk });

  // 3. First "run due" as of Feb 1: rent (1 occurrence @ Jan 31), retainer (1 @ Jan 15),
  // fuel (weekly Jan 5/12/19/26 = 4 occurrences, next would be Feb 2 which is after asOf).
  const run1 = await (await fetch(`${base}/api/recurring/run`, { method: 'POST', headers, body: JSON.stringify({ asOfDate: '2026-02-01' }) })).json();
  log('run 1 (asOf 2026-02-01)', run1);
  const rentAfterRun1 = run1.processed.find((p) => p.recurringTransactionId === rent.id);
  const retainerAfterRun1 = run1.processed.find((p) => p.recurringTransactionId === retainer.id);
  const fuelAfterRun1 = run1.processed.find((p) => p.recurringTransactionId === fuel.id);
  const run1Ok = rentAfterRun1?.occurrencesPosted === 1 && retainerAfterRun1?.occurrencesPosted === 1 && fuelAfterRun1?.occurrencesPosted === 4;

  // 4. Month-end clamping: rent's next run after Jan 31 must be Feb 28, not "Mar 3".
  const listAfterRun1 = (await (await fetch(`${base}/api/recurring`, { headers })).json()).recurringTransactions;
  const rentRow1 = listAfterRun1.find((r) => r.id === rent.id);
  const clampedOk = rentRow1.nextRunDate === '2026-02-28';
  log('rent next run date after Jan 31', { nextRunDate: rentRow1.nextRunDate, clampedOk });

  // 5. Pause the fuel bill before the second run.
  const pauseRes = await fetch(`${base}/api/recurring/${fuel.id}`, { method: 'PUT', headers, body: JSON.stringify({ isActive: false }) });
  const pauseOk = pauseRes.ok;

  // 6. Second run as of Feb 28: rent posts its clamped Feb 28 occurrence, retainer posts
  // Feb 15, fuel is paused so it must NOT appear in this run at all.
  const run2 = await (await fetch(`${base}/api/recurring/run`, { method: 'POST', headers, body: JSON.stringify({ asOfDate: '2026-02-28' }) })).json();
  log('run 2 (asOf 2026-02-28)', run2);
  const rentAfterRun2 = run2.processed.find((p) => p.recurringTransactionId === rent.id);
  const retainerAfterRun2 = run2.processed.find((p) => p.recurringTransactionId === retainer.id);
  const fuelInRun2 = run2.processed.find((p) => p.recurringTransactionId === fuel.id);
  const run2Ok = rentAfterRun2?.occurrencesPosted === 1 && rentAfterRun2.results[0].date === '2026-02-28'
    && retainerAfterRun2?.occurrencesPosted === 1 && retainerAfterRun2.results[0].date === '2026-02-15'
    && !fuelInRun2;

  // 7. Totals: rent has posted 2 occurrences of GHS 500 (amounts include tax where relevant), retainer 2 of GHS 1000, fuel still just 4.
  const listAfterRun2 = (await (await fetch(`${base}/api/recurring`, { headers })).json()).recurringTransactions;
  const rentRow2 = listAfterRun2.find((r) => r.id === rent.id);
  const retainerRow2 = listAfterRun2.find((r) => r.id === retainer.id);
  const fuelRow2 = listAfterRun2.find((r) => r.id === fuel.id);
  const totalsOk = rentRow2.occurrencesPosted === 2 && retainerRow2.occurrencesPosted === 2 && fuelRow2.occurrencesPosted === 4 && fuelRow2.isActive === false;
  log('totals after both runs', { rent: rentRow2, retainer: retainerRow2, fuel: fuelRow2 });

  // 8. Run history for rent shows both dated occurrences with the right amount.
  const rentRuns = (await (await fetch(`${base}/api/recurring/${rent.id}/runs`, { headers })).json()).runs;
  const historyOk = rentRuns.length === 2 && rentRuns.every((r) => Number(r.amount) === 500);
  log('rent run history', rentRuns);

  // 9. Role gate: a cashier can view the list but can't create or run recurring transactions.
  const cashierLogin = await login('cashier@demo-sme.com', 'ChronoBooks!123').catch(() => null);
  let roleGateOk = true;
  if (cashierLogin && cashierLogin.accessToken) {
    const cashierHeaders = { Authorization: `Bearer ${cashierLogin.accessToken}`, 'Content-Type': 'application/json' };
    const listRes = await fetch(`${base}/api/recurring`, { headers: cashierHeaders });
    const createRes = await fetch(`${base}/api/recurring`, { method: 'POST', headers: cashierHeaders, body: JSON.stringify({ type: 'expense', name: 'x', frequency: 'monthly', startDate: '2026-01-01', payload: { category: 'Fuel', paidFromAccountCode: '1010', amount: 1 } }) });
    const runRes = await fetch(`${base}/api/recurring/run`, { method: 'POST', headers: cashierHeaders, body: JSON.stringify({ asOfDate: '2026-02-28' }) });
    roleGateOk = listRes.ok && createRes.status === 403 && runRes.status === 403;
    log('cashier role gate', { list: listRes.status, create: createRes.status, run: runRes.status });
  }

  // 10. Books still balance after all of this.
  const trialBalance = await (await fetch(`${base}/api/reports/trial-balance?asOf=2026-12-31`, { headers })).json();
  const balancedOk = trialBalance.balanced === true;
  log('trial balance', { balanced: trialBalance.balanced });

  const ok = inventoryCategoryBlockedOk && createdOk && run1Ok && clampedOk && pauseOk && run2Ok && totalsOk && historyOk && roleGateOk && balancedOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`inventoryCategoryBlockedOk=${inventoryCategoryBlockedOk} createdOk=${createdOk} run1Ok=${run1Ok} clampedOk=${clampedOk} pauseOk=${pauseOk}`);
  console.log(`run2Ok=${run2Ok} totalsOk=${totalsOk} historyOk=${historyOk} roleGateOk=${roleGateOk} balancedOk=${balancedOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
