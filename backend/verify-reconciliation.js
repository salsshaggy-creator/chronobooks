// Smoke test for Bank Reconciliation: clearing the opening-balance entry, the "doesn't
// balance yet" rejection, a partial reconciliation that leaves an item outstanding for
// next time, cleared items never resurfacing as candidates, a stale/already-cleared id
// being rejected, and a transfer's two GL lines reconciling independently per account.
require('dotenv').config();
const app = require('./src/app');

function log(label, data) {
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(data, null, 2));
}
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
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

  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ bankReconciliationEnabled: true }) });

  const accountsBefore = (await (await fetch(`${base}/api/bank-accounts`, { headers })).json()).bankAccounts;
  const main = accountsBefore[0];

  // 1. Baseline: as of a far-future date, the only candidate is the opening balance entry.
  const state0 = await (await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation?asOf=2099-12-31`, { headers })).json();
  log('baseline state', state0);
  const baselineOk = state0.candidates.length === 1;
  const openingEntry = state0.candidates[0];

  // 2. Complete a reconciliation clearing just the opening entry.
  const rec1Res = await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation`, {
    method: 'POST', headers,
    body: JSON.stringify({ statementDate: openingEntry.date, statementBalance: state0.bookBalance, clearedJournalEntryIds: [openingEntry.id] }),
  });
  const rec1Body = await rec1Res.json();
  log('reconcile opening entry', { status: rec1Res.status, body: rec1Body });
  const rec1Ok = rec1Res.ok && rec1Body.itemsCleared === 1 && rec1Body.clearedTotal === state0.bookBalance && rec1Body.outstandingTotal === 0;

  // 3. The cleared opening entry never resurfaces.
  const state1 = await (await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation?asOf=2099-12-31`, { headers })).json();
  const clearedNeverResurfacesOk = state1.candidates.length === 0;
  log('after clearing opening entry', state1);

  // 4. New activity: a deposit and a withdrawal, both after the opening entry.
  await fetch(`${base}/api/bank-accounts/deposit`, { method: 'POST', headers, body: JSON.stringify({ bankAccountId: main.id, amount: 500, date: '2030-01-15', reference: 'DEP-REC' }) });
  await fetch(`${base}/api/bank-accounts/withdraw`, { method: 'POST', headers, body: JSON.stringify({ bankAccountId: main.id, amount: 100, date: '2030-01-20', reference: 'WD-REC' }) });

  const state2 = await (await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation?asOf=2030-01-20`, { headers })).json();
  log('state with two new candidates', state2);
  const twoCandidatesOk = state2.candidates.length === 2;
  const depositEntry = state2.candidates.find((c) => c.amount > 0);
  const withdrawalEntry = state2.candidates.find((c) => c.amount < 0);
  const signsOk = !!depositEntry && !!withdrawalEntry && depositEntry.amount === 500 && withdrawalEntry.amount === -100;

  // 5. Rejecting a reconciliation that doesn't balance.
  const badRes = await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation`, {
    method: 'POST', headers,
    body: JSON.stringify({ statementDate: '2030-01-20', statementBalance: round2(state1.bookBalance + 500 + 1), clearedJournalEntryIds: [depositEntry.id] }),
  });
  const notBalancedBlockedOk = badRes.status === 400;
  log('unbalanced reconciliation blocked', { status: badRes.status });

  // 6. Partial reconciliation: clear only the deposit, leave the withdrawal outstanding on purpose.
  const rec2Res = await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation`, {
    method: 'POST', headers,
    body: JSON.stringify({ statementDate: '2030-01-20', statementBalance: round2(state1.bookBalance + 500), clearedJournalEntryIds: [depositEntry.id] }),
  });
  const rec2Body = await rec2Res.json();
  log('partial reconciliation (deposit only)', { status: rec2Res.status, body: rec2Body });
  const rec2Ok = rec2Res.ok && rec2Body.itemsCleared === 1 && rec2Body.clearedTotal === 500 && rec2Body.outstandingTotal === -100;

  // 7. Only the withdrawal remains outstanding.
  const state3 = await (await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation?asOf=2030-01-20`, { headers })).json();
  const onlyWithdrawalLeftOk = state3.candidates.length === 1 && state3.candidates[0].id === withdrawalEntry.id;
  log('only withdrawal left outstanding', state3);

  // 8. Reusing the already-cleared deposit id is rejected as stale.
  const staleRes = await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation`, {
    method: 'POST', headers,
    body: JSON.stringify({ statementDate: '2030-01-20', statementBalance: 500, clearedJournalEntryIds: [depositEntry.id] }),
  });
  const staleBlockedOk = staleRes.status === 400;
  log('stale id blocked', { status: staleRes.status });

  // 9. Transfer between two bank accounts reconciles independently per account.
  const newAccountRes = await fetch(`${base}/api/bank-accounts`, {
    method: 'POST', headers, body: JSON.stringify({ name: 'Reconciliation Savings', openingBalance: 0 }),
  });
  const newAccount = await newAccountRes.json();
  await fetch(`${base}/api/bank-accounts/transfer`, {
    method: 'POST', headers,
    body: JSON.stringify({ fromBankAccountId: main.id, toBankAccountId: newAccount.id, amount: 200, date: '2030-01-25', reference: 'TRF-REC' }),
  });

  const mainStateAfterTransfer = await (await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation?asOf=2030-01-25`, { headers })).json();
  const savingsStateAfterTransfer = await (await fetch(`${base}/api/bank-accounts/${newAccount.id}/reconciliation?asOf=2030-01-25`, { headers })).json();
  const transferOnMainOk = mainStateAfterTransfer.candidates.some((c) => c.amount === -200 && c.sourceType === 'transfer');
  const transferOnSavingsOk = savingsStateAfterTransfer.candidates.some((c) => c.amount === 200 && c.sourceType === 'transfer');
  log('transfer appears on both sides', { mainCandidates: mainStateAfterTransfer.candidates, savingsCandidates: savingsStateAfterTransfer.candidates });

  // Clear the transfer + the still-outstanding withdrawal on the main account.
  const rec3Res = await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation`, {
    method: 'POST', headers,
    body: JSON.stringify({ statementDate: '2030-01-25', statementBalance: mainStateAfterTransfer.bookBalance, clearedJournalEntryIds: mainStateAfterTransfer.candidates.map((c) => c.id) }),
  });
  const rec3Ok = rec3Res.ok;
  log('clear main side of transfer', { status: rec3Res.status });

  // Clearing the main side must NOT clear the savings side of the same journal entry.
  const savingsStateAfterMainCleared = await (await fetch(`${base}/api/bank-accounts/${newAccount.id}/reconciliation?asOf=2030-01-25`, { headers })).json();
  const independentClearingOk = savingsStateAfterMainCleared.candidates.some((c) => c.amount === 200 && c.sourceType === 'transfer');
  log('savings side still outstanding after main cleared', savingsStateAfterMainCleared);

  // 10. Reconciliation history is recorded.
  const history = await (await fetch(`${base}/api/bank-accounts/${main.id}/reconciliations`, { headers })).json();
  const historyOk = history.reconciliations.length === 3;
  log('history', history);

  // 11. A cashier (no reconciliation role) is blocked.
  const cashierLogin = await login('cashier@demo-sme.com', 'ChronoBooks!123').catch(() => null);
  let roleGateOk = true;
  if (cashierLogin && cashierLogin.accessToken) {
    const cashierHeaders = { Authorization: `Bearer ${cashierLogin.accessToken}`, 'Content-Type': 'application/json' };
    const blockedRes = await fetch(`${base}/api/bank-accounts/${main.id}/reconciliation?asOf=2099-12-31`, { headers: cashierHeaders });
    roleGateOk = blockedRes.status === 403;
    log('cashier blocked', { status: blockedRes.status });
  }

  // 12. Books still balance after all of this.
  const trialBalance = await (await fetch(`${base}/api/reports/trial-balance?asOf=2099-12-31`, { headers })).json();
  const balancedOk = trialBalance.balanced === true;
  log('trial balance', { balanced: trialBalance.balanced });

  const ok = baselineOk && rec1Ok && clearedNeverResurfacesOk && twoCandidatesOk && signsOk && notBalancedBlockedOk
    && rec2Ok && onlyWithdrawalLeftOk && staleBlockedOk && transferOnMainOk && transferOnSavingsOk
    && rec3Ok && independentClearingOk && historyOk && roleGateOk && balancedOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`baselineOk=${baselineOk} rec1Ok=${rec1Ok} clearedNeverResurfacesOk=${clearedNeverResurfacesOk} twoCandidatesOk=${twoCandidatesOk} signsOk=${signsOk}`);
  console.log(`notBalancedBlockedOk=${notBalancedBlockedOk} rec2Ok=${rec2Ok} onlyWithdrawalLeftOk=${onlyWithdrawalLeftOk} staleBlockedOk=${staleBlockedOk}`);
  console.log(`transferOnMainOk=${transferOnMainOk} transferOnSavingsOk=${transferOnSavingsOk} rec3Ok=${rec3Ok} independentClearingOk=${independentClearingOk}`);
  console.log(`historyOk=${historyOk} roleGateOk=${roleGateOk} balancedOk=${balancedOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
