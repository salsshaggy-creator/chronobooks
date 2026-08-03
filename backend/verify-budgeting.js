// Smoke test for Budgeting: the editable grid (bulk save + upsert-not-duplicate on
// re-save), and the Budget vs Actual comparison correctly summing real journal activity
// against planned amounts, with favorable/unfavorable flags for both income and expense.
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

  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ budgetingEnabled: true }) });

  // 1. Fresh grid for 2026: every income/expense account present, everything at 0.
  const grid1 = await (await fetch(`${base}/api/budgets?year=2026`, { headers })).json();
  const salesAccount = grid1.accounts.find((a) => a.name === 'Sales');
  const fuelAccount = grid1.accounts.find((a) => a.name === 'Fuel');
  const freshGridOk = !!salesAccount && !!fuelAccount && salesAccount.total === 0 && fuelAccount.total === 0;
  log('fresh grid', { freshGridOk, accountCount: grid1.accounts.length });
  if (!salesAccount || !fuelAccount) throw new Error('Expected Sales and Fuel accounts in the budgetable list');

  // 2. Bulk save: Sales and Fuel budgets for Jan-Mar.
  const saveRes = await fetch(`${base}/api/budgets`, {
    method: 'PUT', headers,
    body: JSON.stringify({
      year: 2026,
      entries: [
        { accountId: salesAccount.accountId, period: '2026-01', amount: 1000 },
        { accountId: salesAccount.accountId, period: '2026-02', amount: 1200 },
        { accountId: salesAccount.accountId, period: '2026-03', amount: 1300 },
        { accountId: fuelAccount.accountId, period: '2026-01', amount: 300 },
        { accountId: fuelAccount.accountId, period: '2026-02', amount: 300 },
        { accountId: fuelAccount.accountId, period: '2026-03', amount: 300 },
      ],
    }),
  });
  const saveBody = await saveRes.json();
  const saveOk = saveRes.ok && saveBody.saved === 6;
  log('bulk save', saveBody);

  // 3. Grid reflects the save.
  const grid2 = await (await fetch(`${base}/api/budgets?year=2026`, { headers })).json();
  const salesAfterSave = grid2.accounts.find((a) => a.name === 'Sales');
  const gridAfterSaveOk = salesAfterSave.months['2026-01'] === 1000 && salesAfterSave.months['2026-02'] === 1200 && salesAfterSave.total === 3500;
  const fuelAfterSave = grid2.accounts.find((a) => a.name === 'Fuel');
  const fuelGridOk = fuelAfterSave.total === 900;

  // 4. Re-saving the same cell updates in place — no duplicate rows, grid shows the new value.
  const resaveRes = await fetch(`${base}/api/budgets`, {
    method: 'PUT', headers,
    body: JSON.stringify({ year: 2026, entries: [{ accountId: salesAccount.accountId, period: '2026-01', amount: 1500 }] }),
  });
  const resaveBody = await resaveRes.json();
  const resaveOk = resaveRes.ok && resaveBody.saved === 1;
  const grid3 = await (await fetch(`${base}/api/budgets?year=2026`, { headers })).json();
  const salesAfterResave = grid3.accounts.find((a) => a.name === 'Sales');
  const upsertNotDuplicatedOk = salesAfterResave.months['2026-01'] === 1500 && salesAfterResave.total === 4000; // 1500+1200+1300
  log('upsert (not duplicated)', { resaveBody, janValue: salesAfterResave.months['2026-01'], total: salesAfterResave.total });

  // 5. Only Administrators/Accountants/Finance Managers/Super Admins can save budgets.
  const cashierLogin = await login('cashier@demo-sme.com', 'ChronoBooks!123').catch(() => null);
  let roleGateOk = true;
  if (cashierLogin && cashierLogin.accessToken) {
    const cashierHeaders = { Authorization: `Bearer ${cashierLogin.accessToken}`, 'Content-Type': 'application/json' };
    const blockedRes = await fetch(`${base}/api/budgets`, { method: 'PUT', headers: cashierHeaders, body: JSON.stringify({ year: 2026, entries: [{ accountId: salesAccount.accountId, period: '2026-01', amount: 1 }] }) });
    roleGateOk = blockedRes.status === 403;
    log('cashier blocked from saving budgets', { status: blockedRes.status });
  }

  // 6. Real activity: an invoice (Sales, Feb) and an expense (Fuel, Feb) inside the Jan-Feb window.
  const customersBody = await (await fetch(`${base}/api/customers`, { headers })).json();
  const customer = customersBody.customers[0];
  const invoiceRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-02-10', incomeCategory: 'Sales', lines: [{ description: 'Consulting', quantity: 1, unitPrice: 1100 }] }),
  });
  if (!invoiceRes.ok) throw new Error('Test invoice failed');

  const expenseRes = await fetch(`${base}/api/expenses`, {
    method: 'POST', headers,
    body: JSON.stringify({ expenseDate: '2026-02-15', category: 'Fuel', paidFromAccountCode: '1010', amount: 250 }),
  });
  if (!expenseRes.ok) throw new Error('Test expense failed');

  // Something outside the Jan-Feb window shouldn't count.
  const marchExpenseRes = await fetch(`${base}/api/expenses`, {
    method: 'POST', headers,
    body: JSON.stringify({ expenseDate: '2026-03-05', category: 'Fuel', paidFromAccountCode: '1010', amount: 999 }),
  });
  if (!marchExpenseRes.ok) throw new Error('Test March expense failed');

  // 7. Budget vs Actual through February: Sales budget 1500+1200=2700, actual=1100 (unfavorable, under target);
  // Fuel budget 300+300=600, actual=250 (favorable, under budget). March's 999 must not leak in.
  const bva = await (await fetch(`${base}/api/reports/budget-vs-actual?year=2026&throughMonth=2`, { headers })).json();
  log('budget vs actual through Feb', bva);
  const salesRow = bva.income.find((r) => r.label === 'Sales');
  const fuelRow = bva.expenses.find((r) => r.label === 'Fuel');
  const bvaOk = salesRow && fuelRow
    && salesRow.budget === 2700 && salesRow.actual === 1100 && salesRow.variance === -1600 && salesRow.favorable === false
    && fuelRow.budget === 600 && fuelRow.actual === 250 && fuelRow.variance === -350 && fuelRow.favorable === true;

  // 8. Trial balance still balances after all of this.
  const trialBalance = await (await fetch(`${base}/api/reports/trial-balance`, { headers })).json();
  const balancedOk = trialBalance.balanced === true;
  log('trial balance', { balanced: trialBalance.balanced });

  const ok = freshGridOk && saveOk && gridAfterSaveOk && fuelGridOk && resaveOk && upsertNotDuplicatedOk && roleGateOk && bvaOk && balancedOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`freshGridOk=${freshGridOk} saveOk=${saveOk} gridAfterSaveOk=${gridAfterSaveOk} fuelGridOk=${fuelGridOk}`);
  console.log(`resaveOk=${resaveOk} upsertNotDuplicatedOk=${upsertNotDuplicatedOk} roleGateOk=${roleGateOk} bvaOk=${bvaOk} balancedOk=${balancedOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
