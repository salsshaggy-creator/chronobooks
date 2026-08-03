// Smoke test for the Fixed Assets module: registering an asset (Debit Fixed Assets /
// Credit paid-from account), straight-line depreciation with whole-month proration and
// idempotent re-runs, the "never below salvage value" cap, disposal recognizing a gain
// and a loss, disposal proceeds validation, and that the books stay balanced throughout.
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

  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ fixedAssetsEnabled: true }) });

  const register = async (body) => {
    const res = await fetch(`${base}/api/fixed-assets`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const findAsset = async (id) => (await (await fetch(`${base}/api/fixed-assets`, { headers })).json()).assets.find((a) => a.id === id);
  const depreciate = async (asOfDate) => {
    const res = await fetch(`${base}/api/fixed-assets/depreciate`, { method: 'POST', headers, body: JSON.stringify({ asOfDate }) });
    return { status: res.status, body: await res.json() };
  };
  const dispose = async (id, payload) => {
    const res = await fetch(`${base}/api/fixed-assets/${id}/dispose`, { method: 'POST', headers, body: JSON.stringify(payload) });
    return { status: res.status, body: await res.json() };
  };

  // 1. Register two assets with different start dates.
  const a = await register({ name: 'Delivery Van', assetNumber: 'VAN-01', purchaseDate: '2025-01-15', purchaseCost: 12000, salvageValue: 0, usefulLifeMonths: 24, paidFromAccountCode: '1010' });
  const b = await register({ name: 'Office Printer', purchaseDate: '2026-01-01', purchaseCost: 6000, salvageValue: 600, usefulLifeMonths: 36, paidFromAccountCode: '1010' });
  log('registered assets', { a: a.status, b: b.status });
  const registerOk = a.status === 201 && b.status === 201 && !!a.body.journalEntryId && !!b.body.journalEntryId;

  // 2. Validation: salvage >= cost, zero useful life, missing paid-from account.
  const badSalvage = await register({ name: 'Bad', purchaseDate: '2026-01-01', purchaseCost: 1000, salvageValue: 1000, usefulLifeMonths: 12, paidFromAccountCode: '1010' });
  const badLife = await register({ name: 'Bad', purchaseDate: '2026-01-01', purchaseCost: 1000, salvageValue: 0, usefulLifeMonths: 0, paidFromAccountCode: '1010' });
  const badAccount = await register({ name: 'Bad', purchaseDate: '2026-01-01', purchaseCost: 1000, salvageValue: 0, usefulLifeMonths: 12 });
  const validationOk = badSalvage.status === 400 && badLife.status === 400 && badAccount.status === 400;
  log('validation rejected bad input', { badSalvage: badSalvage.status, badLife: badLife.status, badAccount: badAccount.status });

  // 3. First depreciation run: only the van has started (printer isn't purchased yet as of this date) -> 3 whole months @ 500/mo = 1500.
  const run1 = await depreciate('2025-04-15');
  log('depreciation run 1', run1.body);
  const run1Ok = run1.body.assetsDepreciated.length === 1 && run1.body.totalAmount === 1500;

  const vanAfterRun1 = await findAsset(a.body.assetId);
  const vanAfterRun1Ok = vanAfterRun1.accumulated_depreciation === 1500 && vanAfterRun1.netBookValue === 10500;

  // 4. Re-running the same date is a no-op (idempotent) — no whole month has elapsed since.
  const run2 = await depreciate('2025-04-15');
  const run2IdempotentOk = run2.body.assetsDepreciated.length === 0 && run2.body.totalAmount === 0 && run2.body.journalEntryId === null;
  log('depreciation run 2 (same date, idempotent)', run2.body);

  // 5. One more month elapses -> another 500 for the van; printer still not purchased yet.
  const run3 = await depreciate('2025-05-20');
  const run3Ok = run3.body.assetsDepreciated.length === 1 && run3.body.totalAmount === 500;
  log('depreciation run 3 (+1 month)', run3.body);

  // 6. Jump ahead: both assets now accrue — van 9 months @ 500, printer 1 month @ 150.
  const run4 = await depreciate('2026-02-01');
  const run4Ok = run4.body.assetsDepreciated.length === 2 && run4.body.totalAmount === 4650;
  log('depreciation run 4 (both assets)', run4.body);

  const vanAfterRun4 = await findAsset(a.body.assetId);
  const printerAfterRun4 = await findAsset(b.body.assetId);
  const run4BalancesOk = vanAfterRun4.accumulated_depreciation === 6500 && printerAfterRun4.accumulated_depreciation === 150;

  // 7. A short-lived asset run far into the future proves depreciation is capped at the
  // depreciable base (cost - salvage) and never goes past "fully depreciated".
  const c = await register({ name: 'Cheap Tablet', purchaseDate: '2026-01-01', purchaseCost: 1000, salvageValue: 0, usefulLifeMonths: 2, paidFromAccountCode: '1010' });
  await depreciate('2030-01-01');
  const tabletAfterCap = await findAsset(c.body.assetId);
  const capOk = tabletAfterCap.accumulated_depreciation === 1000 && tabletAfterCap.netBookValue === 0 && tabletAfterCap.fullyDepreciated === true;
  log('cap test (never depreciates past cost)', tabletAfterCap);

  // 8. Disposal with a gain: sold for more than net book value.
  const d = await register({ name: 'Generator', purchaseDate: '2026-01-01', purchaseCost: 2000, salvageValue: 0, usefulLifeMonths: 10, paidFromAccountCode: '1010' });
  await depreciate('2026-03-01'); // 2 months @ 200 = 400 accumulated -> book value 1600
  const disposeGain = await dispose(d.body.assetId, { disposalDate: '2026-03-15', proceeds: 2000, depositToAccountCode: '1010' });
  const disposeGainOk = disposeGain.status === 200 && disposeGain.body.bookValue === 1600 && disposeGain.body.gainLoss === 400;
  log('disposal with gain', disposeGain.body);

  // 9. Can't dispose the same asset twice.
  const disposeAgain = await dispose(d.body.assetId, { disposalDate: '2026-03-16', proceeds: 0 });
  const disposeAgainBlockedOk = disposeAgain.status === 400;

  // 10. Disposal with a loss: sold for less than net book value (no depreciation posted, so book value = cost).
  const e = await register({ name: 'Old Laptop', purchaseDate: '2026-01-01', purchaseCost: 3000, salvageValue: 0, usefulLifeMonths: 10, paidFromAccountCode: '1010' });
  const disposeLoss = await dispose(e.body.assetId, { disposalDate: '2026-02-01', proceeds: 1000, depositToAccountCode: '1010' });
  const disposeLossOk = disposeLoss.status === 200 && disposeLoss.body.bookValue === 3000 && disposeLoss.body.gainLoss === -2000;
  log('disposal with loss', disposeLoss.body);

  // 11. Disposal for zero proceeds (scrapped) doesn't require a deposit account.
  const g = await register({ name: 'Broken Chair', purchaseDate: '2026-01-01', purchaseCost: 500, salvageValue: 0, usefulLifeMonths: 5, paidFromAccountCode: '1010' });
  const disposeScrap = await dispose(g.body.assetId, { disposalDate: '2026-01-20', proceeds: 0 });
  const disposeScrapOk = disposeScrap.status === 200 && disposeScrap.body.gainLoss === -500;

  // 12. Disposal with proceeds but no deposit account is rejected.
  const h = await register({ name: 'Test Item', purchaseDate: '2026-01-01', purchaseCost: 100, salvageValue: 0, usefulLifeMonths: 5, paidFromAccountCode: '1010' });
  const disposeNoAccount = await dispose(h.body.assetId, { disposalDate: '2026-01-20', proceeds: 50 });
  const disposeNoAccountBlockedOk = disposeNoAccount.status === 400;
  log('disposal proceeds without deposit account blocked', { status: disposeNoAccount.status });

  // 13. Editing descriptive fields works without touching financial fields.
  const updateRes = await fetch(`${base}/api/fixed-assets/${e.body.assetId}`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Old Laptop (renamed)' }) });
  const updateOk = updateRes.ok;

  // 14. Movement history for the van has an entry per depreciation run it took part in.
  const vanMovements = await (await fetch(`${base}/api/fixed-assets/${a.body.assetId}/movements`, { headers })).json();
  const movementsOk = vanMovements.movements.length >= 3 && vanMovements.movements.every((m) => m.amount > 0);
  log('van movement history', { count: vanMovements.movements.length });

  // 15. Books still balance after every acquisition, depreciation run, and disposal.
  const trialBalance = await (await fetch(`${base}/api/reports/trial-balance`, { headers })).json();
  log('trial balance', { totalDebit: trialBalance.totalDebit, totalCredit: trialBalance.totalCredit, balanced: trialBalance.balanced });
  const balancedOk = trialBalance.balanced === true;

  const ok = registerOk && validationOk && run1Ok && vanAfterRun1Ok && run2IdempotentOk && run3Ok && run4Ok && run4BalancesOk
    && capOk && disposeGainOk && disposeAgainBlockedOk && disposeLossOk && disposeScrapOk && disposeNoAccountBlockedOk
    && updateOk && movementsOk && balancedOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`registerOk=${registerOk} validationOk=${validationOk} run1Ok=${run1Ok} vanAfterRun1Ok=${vanAfterRun1Ok}`);
  console.log(`run2IdempotentOk=${run2IdempotentOk} run3Ok=${run3Ok} run4Ok=${run4Ok} run4BalancesOk=${run4BalancesOk} capOk=${capOk}`);
  console.log(`disposeGainOk=${disposeGainOk} disposeAgainBlockedOk=${disposeAgainBlockedOk} disposeLossOk=${disposeLossOk}`);
  console.log(`disposeScrapOk=${disposeScrapOk} disposeNoAccountBlockedOk=${disposeNoAccountBlockedOk} updateOk=${updateOk} movementsOk=${movementsOk} balancedOk=${balancedOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
