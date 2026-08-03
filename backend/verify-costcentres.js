// Smoke test for Cost Centres: tagging a Sales invoice, Purchases bill, and Expense
// with a cost centre, rejecting an unknown cost centre id, the list views showing the
// tag, and the Cost Centres report correctly breaking down income/expenses per centre
// with an "Unassigned" bucket catching untagged records in the same date window.
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

  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ costCentresEnabled: true }) });

  const customersBody = await (await fetch(`${base}/api/customers`, { headers })).json();
  const customer = customersBody.customers[0];
  const suppliersBody = await (await fetch(`${base}/api/suppliers`, { headers })).json();
  const supplier = suppliersBody.suppliers[0];

  // 1. "OPS" already exists as demo seed data (seedParameters.js) — reuse it — and
  // create one brand-new cost centre, "MKT", to prove the create path also works.
  const existingCentres = await (await fetch(`${base}/api/parameters/cost-centres`, { headers })).json();
  const opsBody = existingCentres.costCentres.find((c) => c.code === 'OPS');
  const mktRes = await fetch(`${base}/api/parameters/cost-centres`, { method: 'POST', headers, body: JSON.stringify({ code: 'MKT', name: 'Marketing' }) });
  const mktBody = await mktRes.json();
  const opsCreatedOk = !!opsBody;
  const mktCreatedOk = mktRes.ok && !!mktBody.id;
  log('cost centres', { opsBody, mktBody });

  // 2. Tag an invoice with OPS.
  const invoiceRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-04-05', incomeCategory: 'Sales', costCentreId: opsBody.id, lines: [{ description: 'Consulting', quantity: 1, unitPrice: 500 }] }),
  });
  const invoiceBody = await invoiceRes.json();
  const taggedInvoiceOk = invoiceRes.ok && invoiceBody.costCentreId === opsBody.id;
  log('tagged invoice', { status: invoiceRes.status, body: invoiceBody });

  // 3. An untagged invoice (falls into Unassigned).
  const plainInvoiceRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-04-06', incomeCategory: 'Sales', lines: [{ description: 'Untagged sale', quantity: 1, unitPrice: 200 }] }),
  });
  if (!plainInvoiceRes.ok) throw new Error('Untagged invoice failed');

  // 4. Tag a bill with OPS.
  const billRes = await fetch(`${base}/api/bills`, {
    method: 'POST', headers,
    body: JSON.stringify({ supplierId: supplier.id, billDate: '2026-04-07', expenseCategory: 'Fuel', costCentreId: opsBody.id, lines: [{ description: 'Fuel', quantity: 1, unitPrice: 80 }] }),
  });
  const billBody = await billRes.json();
  const taggedBillOk = billRes.ok && billBody.costCentreId === opsBody.id;
  log('tagged bill', { status: billRes.status, body: billBody });

  // 5. Tag an expense with MKT; an untagged expense too.
  const expenseRes = await fetch(`${base}/api/expenses`, {
    method: 'POST', headers,
    body: JSON.stringify({ expenseDate: '2026-04-08', category: 'Fuel', paidFromAccountCode: '1010', amount: 40, costCentreId: mktBody.id }),
  });
  const expenseBody = await expenseRes.json();
  const taggedExpenseOk = expenseRes.ok && expenseBody.costCentreId === mktBody.id;
  log('tagged expense', { status: expenseRes.status, body: expenseBody });

  const plainExpenseRes = await fetch(`${base}/api/expenses`, {
    method: 'POST', headers,
    body: JSON.stringify({ expenseDate: '2026-04-09', category: 'Fuel', paidFromAccountCode: '1010', amount: 20 }),
  });
  if (!plainExpenseRes.ok) throw new Error('Untagged expense failed');

  // 6. An unknown cost centre id is rejected with a clear 400.
  const badRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-04-10', incomeCategory: 'Sales', costCentreId: 999999, lines: [{ description: 'x', quantity: 1, unitPrice: 10 }] }),
  });
  const unknownCentreBlockedOk = badRes.status === 400;
  log('unknown cost centre blocked', { status: badRes.status });

  // 7. List views show the tag.
  const invoicesList = await (await fetch(`${base}/api/invoices`, { headers })).json();
  const listedInvoice = invoicesList.invoices.find((i) => i.id === invoiceBody.invoiceId);
  const listShowsTagOk = listedInvoice && listedInvoice.cost_centre_code === 'OPS';
  log('invoice list shows tag', { cost_centre_code: listedInvoice && listedInvoice.cost_centre_code });

  // 8. Cost Centres report for April: OPS income=500 expenses=80 net=420;
  // MKT income=0 expenses=40 net=-40; Unassigned income=200 expenses=20 net=180.
  const report = await (await fetch(`${base}/api/reports/cost-centres?from=2026-04-01&to=2026-04-30`, { headers })).json();
  log('cost centre report', report);
  const opsRow = report.centres.find((c) => c.code === 'OPS');
  const mktRow = report.centres.find((c) => c.code === 'MKT');
  const reportOk = opsRow && mktRow
    && opsRow.income === 500 && opsRow.expenses === 80 && opsRow.net === 420
    && mktRow.income === 0 && mktRow.expenses === 40 && mktRow.net === -40
    && report.unassigned.income === 200 && report.unassigned.expenses === 20 && report.unassigned.net === 180
    && report.totalIncome === 700 && report.totalExpenses === 140 && report.totalNet === 560;

  // 9. Backward compatibility: an invoice with no costCentreId at all behaves exactly as before.
  const backwardCompatOk = plainInvoiceRes.ok;

  // 10. Books still balance after all of this.
  const trialBalance = await (await fetch(`${base}/api/reports/trial-balance`, { headers })).json();
  const balancedOk = trialBalance.balanced === true;
  log('trial balance', { balanced: trialBalance.balanced });

  const ok = opsCreatedOk && mktCreatedOk && taggedInvoiceOk && taggedBillOk && taggedExpenseOk
    && unknownCentreBlockedOk && listShowsTagOk && reportOk && backwardCompatOk && balancedOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`opsCreatedOk=${opsCreatedOk} mktCreatedOk=${mktCreatedOk} taggedInvoiceOk=${taggedInvoiceOk} taggedBillOk=${taggedBillOk}`);
  console.log(`taggedExpenseOk=${taggedExpenseOk} unknownCentreBlockedOk=${unknownCentreBlockedOk} listShowsTagOk=${listShowsTagOk}`);
  console.log(`reportOk=${reportOk} backwardCompatOk=${backwardCompatOk} balancedOk=${balancedOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
