// Smoke test for Reports: replays an expense, an invoice + receipt, and a bill +
// payment (same as the other verify scripts), then checks that Profit & Loss,
// Balance Sheet, and Trial Balance all come out numerically correct and, critically,
// that the Balance Sheet actually balances and the Trial Balance sums to zero.
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo-sme.com', password: 'ChronoBooks!123' }),
  })).json();
  const headers = { Authorization: `Bearer ${loginBody.accessToken}`, 'Content-Type': 'application/json' };

  const customers = (await (await fetch(`${base}/api/customers`, { headers })).json()).customers;
  const suppliers = (await (await fetch(`${base}/api/suppliers`, { headers })).json()).suppliers;

  await fetch(`${base}/api/expenses`, {
    method: 'POST', headers,
    body: JSON.stringify({ expenseDate: '2026-07-23', category: 'Fuel', paidFromAccountCode: '1010', amount: 450, tax: 0, reference: 'FUEL-001' }),
  });

  const invoice = await (await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customers[0].id, invoiceDate: '2026-07-23', incomeCategory: 'Sales', taxRatePercent: 0, lines: [{ description: 'Consulting', quantity: 1, unitPrice: 2000 }] }),
  })).json();
  await fetch(`${base}/api/receipts`, {
    method: 'POST', headers,
    body: JSON.stringify({ invoiceId: invoice.invoiceId, receiptDate: '2026-07-24', depositedToAccountCode: '1010', amount: 1200 }),
  });

  const bill = await (await fetch(`${base}/api/bills`, {
    method: 'POST', headers,
    body: JSON.stringify({ supplierId: suppliers[0].id, billDate: '2026-07-23', expenseCategory: 'Office Supplies', taxRatePercent: 0, lines: [{ description: 'Paper', quantity: 1, unitPrice: 800 }] }),
  })).json();
  await fetch(`${base}/api/supplier-payments`, {
    method: 'POST', headers,
    body: JSON.stringify({ billId: bill.billId, paymentDate: '2026-07-24', paidFromAccountCode: '1010', amount: 300 }),
  });

  const pl = await (await fetch(`${base}/api/reports/profit-and-loss?from=2026-01-01&to=2026-12-31`, { headers })).json();
  log('Profit & Loss', pl);

  const bs = await (await fetch(`${base}/api/reports/balance-sheet?asOf=2026-12-31`, { headers })).json();
  log('Balance Sheet', bs);

  const tb = await (await fetch(`${base}/api/reports/trial-balance?asOf=2026-12-31`, { headers })).json();
  log('Trial Balance', tb);

  // Expected: income 2000 (Sales), expenses 450 (Fuel) + 800 (Office Supplies) = 1250, net profit 750.
  const expectedIncome = 2000;
  const expectedExpenses = 1250;
  const expectedNetProfit = 750;

  const plOk = pl.totalIncome === expectedIncome && pl.totalExpenses === expectedExpenses && pl.netProfit === expectedNetProfit;
  const bsOk = bs.balanced && Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)) < 0.01;
  const tbOk = tb.balanced && Math.abs(tb.totalDebit - tb.totalCredit) < 0.01;

  console.log(`\n== RESULT: ${plOk && bsOk && tbOk ? 'PASS' : 'FAIL'} ==`);
  console.log(`P&L: income ${pl.totalIncome} (expected ${expectedIncome}), expenses ${pl.totalExpenses} (expected ${expectedExpenses}), net ${pl.netProfit} (expected ${expectedNetProfit}) -> ${plOk ? 'OK' : 'MISMATCH'}`);
  console.log(`Balance Sheet: assets ${bs.totalAssets}, liabilities+equity ${bs.totalLiabilities + bs.totalEquity} -> ${bsOk ? 'BALANCED' : 'NOT BALANCED'}`);
  console.log(`Trial Balance: debit ${tb.totalDebit}, credit ${tb.totalCredit} -> ${tbOk ? 'BALANCED' : 'NOT BALANCED'}`);

  server.close();
  process.exit(plOk && bsOk && tbOk ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
