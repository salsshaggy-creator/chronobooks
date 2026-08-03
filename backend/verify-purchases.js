// One-shot smoke test for the Purchases slice: login -> list seeded suppliers ->
// record a bill -> confirm dashboard shows outstanding suppliers + expenses ->
// record a partial supplier payment -> confirm bank balance and outstanding drop.
require('dotenv').config();
const app = require('./src/app');

function log(label, data) {
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(data, null, 2));
}

// Dated "today" rather than a fixed string -- monthlyExpenses is checked against the
// real current month, so a hardcoded date silently breaks once wall-clock time crosses
// into a new month.
const today = () => new Date().toISOString().slice(0, 10);

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

  const dashStart = await (await fetch(`${base}/api/dashboard/summary`, { headers })).json();
  log('dashboard at start', { bankBalance: dashStart.bankBalance, outstandingSuppliers: dashStart.outstandingSuppliers, monthlyExpenses: dashStart.monthlyExpenses });

  const suppliersBody = await (await fetch(`${base}/api/suppliers`, { headers })).json();
  log('seeded suppliers', suppliersBody.suppliers.map((s) => s.name));
  const supplier = suppliersBody.suppliers[0];

  const billRes = await fetch(`${base}/api/bills`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      supplierId: supplier.id,
      billDate: today(),
      dueDate: '2026-08-06',
      expenseCategory: 'Office Supplies',
      taxRatePercent: 0,
      lines: [{ description: 'Printer paper and toner', quantity: 1, unitPrice: 800 }],
    }),
  });
  const billBody = await billRes.json();
  log('recorded bill', { status: billRes.status, body: billBody });
  if (!billRes.ok) throw new Error('Bill creation failed');

  const dashAfterBill = await (await fetch(`${base}/api/dashboard/summary`, { headers })).json();
  log('dashboard after bill', { bankBalance: dashAfterBill.bankBalance, outstandingSuppliers: dashAfterBill.outstandingSuppliers, monthlyExpenses: dashAfterBill.monthlyExpenses });

  const paymentRes = await fetch(`${base}/api/supplier-payments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      billId: billBody.billId,
      paymentDate: today(),
      paidFromAccountCode: '1010',
      amount: 300,
      paymentMethod: 'Bank transfer',
      reference: 'PAY-001',
    }),
  });
  const paymentBody = await paymentRes.json();
  log('recorded partial supplier payment', { status: paymentRes.status, body: paymentBody });
  if (!paymentRes.ok) throw new Error('Supplier payment failed');

  const dashAfterPayment = await (await fetch(`${base}/api/dashboard/summary`, { headers })).json();
  log('dashboard after payment', { bankBalance: dashAfterPayment.bankBalance, outstandingSuppliers: dashAfterPayment.outstandingSuppliers, monthlyExpenses: dashAfterPayment.monthlyExpenses });

  const expectedBank = 25000 - 300;
  const expectedOutstanding = 800 - 300;
  const expectedExpenses = 800;
  const ok =
    dashAfterPayment.bankBalance === expectedBank &&
    Math.abs(dashAfterPayment.outstandingSuppliers - expectedOutstanding) < 0.01 &&
    dashAfterPayment.monthlyExpenses === expectedExpenses &&
    paymentBody.billStatus === 'partially_paid';

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`Expected bank balance ${expectedBank}, got ${dashAfterPayment.bankBalance}`);
  console.log(`Expected outstanding suppliers ${expectedOutstanding}, got ${dashAfterPayment.outstandingSuppliers}`);
  console.log(`Expected monthly expenses ${expectedExpenses}, got ${dashAfterPayment.monthlyExpenses}`);
  console.log(`Expected bill status partially_paid, got ${paymentBody.billStatus}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
