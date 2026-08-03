// One-shot smoke test for the Sales & Invoicing slice: login -> list seeded customers
// -> raise an invoice -> confirm dashboard shows outstanding balance + income -> record
// a partial receipt -> confirm bank balance and outstanding balance both update.
require('dotenv').config();
const app = require('./src/app');

function log(label, data) {
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(data, null, 2));
}

// Dated "today" rather than a fixed string -- monthlyIncome is checked against the real
// current month, so a hardcoded date silently breaks once wall-clock time crosses into a
// new month.
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
  log('dashboard at start', { bankBalance: dashStart.bankBalance, outstandingCustomers: dashStart.outstandingCustomers, monthlyIncome: dashStart.monthlyIncome });

  const customersBody = await (await fetch(`${base}/api/customers`, { headers })).json();
  log('seeded customers', customersBody.customers.map((c) => c.name));
  const customer = customersBody.customers[0];

  const invoiceRes = await fetch(`${base}/api/invoices`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customerId: customer.id,
      invoiceDate: today(),
      dueDate: '2026-08-06',
      incomeCategory: 'Sales',
      taxRatePercent: 0,
      lines: [{ description: 'Consulting services', quantity: 1, unitPrice: 2000 }],
    }),
  });
  const invoiceBody = await invoiceRes.json();
  log('created invoice', { status: invoiceRes.status, body: invoiceBody });
  if (!invoiceRes.ok) throw new Error('Invoice creation failed');

  const dashAfterInvoice = await (await fetch(`${base}/api/dashboard/summary`, { headers })).json();
  log('dashboard after invoice', { bankBalance: dashAfterInvoice.bankBalance, outstandingCustomers: dashAfterInvoice.outstandingCustomers, monthlyIncome: dashAfterInvoice.monthlyIncome });

  const receiptRes = await fetch(`${base}/api/receipts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      invoiceId: invoiceBody.invoiceId,
      receiptDate: today(),
      depositedToAccountCode: '1010',
      amount: 1200,
      paymentMethod: 'Bank transfer',
      reference: 'RCPT-001',
    }),
  });
  const receiptBody = await receiptRes.json();
  log('recorded partial receipt', { status: receiptRes.status, body: receiptBody });
  if (!receiptRes.ok) throw new Error('Receipt creation failed');

  const dashAfterReceipt = await (await fetch(`${base}/api/dashboard/summary`, { headers })).json();
  log('dashboard after receipt', { bankBalance: dashAfterReceipt.bankBalance, outstandingCustomers: dashAfterReceipt.outstandingCustomers, monthlyIncome: dashAfterReceipt.monthlyIncome });

  const expectedBank = 25000 + 1200;
  const expectedOutstanding = 2000 - 1200;
  const expectedIncome = 2000;
  const ok =
    dashAfterReceipt.bankBalance === expectedBank &&
    Math.abs(dashAfterReceipt.outstandingCustomers - expectedOutstanding) < 0.01 &&
    dashAfterReceipt.monthlyIncome === expectedIncome &&
    receiptBody.invoiceStatus === 'partially_paid';

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`Expected bank balance ${expectedBank}, got ${dashAfterReceipt.bankBalance}`);
  console.log(`Expected outstanding ${expectedOutstanding}, got ${dashAfterReceipt.outstandingCustomers}`);
  console.log(`Expected monthly income ${expectedIncome}, got ${dashAfterReceipt.monthlyIncome}`);
  console.log(`Expected invoice status partially_paid, got ${receiptBody.invoiceStatus}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
