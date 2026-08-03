// Smoke test for Multi-Currency: rate resolution from Parameters -> Exchange Rates,
// manual rate override, the missing-rate error, base-currency-only posting (the ledger
// never sees a foreign amount), full backward compatibility when no currency is given,
// and the Inventory interaction (a foreign-currency stock receipt converts unit cost).
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

  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ multiCurrencyEnabled: true, inventoryEnabled: true }) });

  const customersBody = await (await fetch(`${base}/api/customers`, { headers })).json();
  const customer = customersBody.customers[0];
  const suppliersBody = await (await fetch(`${base}/api/suppliers`, { headers })).json();
  const supplier = suppliersBody.suppliers[0];

  // Register a USD -> GHS rate in Parameters for the resolver to find.
  const rateRes = await fetch(`${base}/api/parameters/exchange-rates`, {
    method: 'POST', headers, body: JSON.stringify({ fromCurrency: 'USD', toCurrency: 'GHS', rate: 15, asOfDate: '2026-01-01' }),
  });
  if (!rateRes.ok) throw new Error('Failed to register exchange rate');

  // 1. Invoice in USD, no manual rate — resolver finds the Parameters rate (15).
  const invoiceRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-01-15', incomeCategory: 'Sales', currency: 'USD', lines: [{ description: 'Consulting', quantity: 1, unitPrice: 100 }] }),
  });
  const invoiceBody = await invoiceRes.json();
  log('USD invoice (auto rate)', { status: invoiceRes.status, body: invoiceBody });
  const autoRateOk = invoiceRes.ok && invoiceBody.total === 1500 && invoiceBody.currency === 'USD' && invoiceBody.exchangeRate === 15 && invoiceBody.foreignTotal === 100;

  // Ledger only ever sees base currency — the P&L for January should show 1500 of income, not 100.
  const pl = await (await fetch(`${base}/api/reports/profit-and-loss?from=2026-01-01&to=2026-01-31`, { headers })).json();
  const ledgerInBaseCurrencyOk = pl.totalIncome === 1500;
  log('P&L for January (base currency only)', { totalIncome: pl.totalIncome });

  // 2. Bill in USD with a manual rate override (16) — ignores the Parameters rate (15).
  const billRes = await fetch(`${base}/api/bills`, {
    method: 'POST', headers,
    body: JSON.stringify({ supplierId: supplier.id, billDate: '2026-01-20', expenseCategory: 'Fuel', currency: 'USD', exchangeRate: 16, lines: [{ description: 'Fuel', quantity: 1, unitPrice: 50 }] }),
  });
  const billBody = await billRes.json();
  log('USD bill (manual rate override)', { status: billRes.status, body: billBody });
  const manualRateOk = billRes.ok && billBody.total === 800 && billBody.exchangeRate === 16 && billBody.foreignTotal === 50;

  // 3. No rate registered for EUR and none typed — rejected with a clear message.
  const noRateRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-01-15', incomeCategory: 'Sales', currency: 'EUR', lines: [{ description: 'Consulting', quantity: 1, unitPrice: 100 }] }),
  });
  const noRateBlockedOk = noRateRes.status === 400;
  log('missing rate blocked', { status: noRateRes.status });

  // 4. Backward compatibility: an invoice with no currency at all behaves exactly as before.
  const plainInvoiceRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-01-16', incomeCategory: 'Sales', lines: [{ description: 'Local sale', quantity: 1, unitPrice: 200 }] }),
  });
  const plainInvoiceBody = await plainInvoiceRes.json();
  const backwardCompatOk = plainInvoiceRes.ok && plainInvoiceBody.total === 200 && plainInvoiceBody.currency === undefined && plainInvoiceBody.foreignTotal === undefined;
  log('plain invoice unaffected', plainInvoiceBody);

  // 5. Expense in USD with a manual rate.
  const expenseRes = await fetch(`${base}/api/expenses`, {
    method: 'POST', headers,
    body: JSON.stringify({ expenseDate: '2026-01-18', category: 'Fuel', paidFromAccountCode: '1010', amount: 20, currency: 'USD', exchangeRate: 15 }),
  });
  const expenseBody = await expenseRes.json();
  log('USD expense', { status: expenseRes.status, body: expenseBody });
  const expenseOk = expenseRes.ok && expenseBody.amount === 300 && expenseBody.foreignTotal === 20;

  // 6. Inventory interaction: a foreign-currency stock receipt converts unit cost to base currency.
  const itemRes = await fetch(`${base}/api/inventory/items`, { method: 'POST', headers, body: JSON.stringify({ name: 'Imported Widget', unit: 'unit' }) });
  const itemBody = await itemRes.json();
  const stockBillRes = await fetch(`${base}/api/bills`, {
    method: 'POST', headers,
    body: JSON.stringify({ supplierId: supplier.id, billDate: '2026-01-22', expenseCategory: 'Inventory', currency: 'USD', exchangeRate: 15, lines: [{ itemId: itemBody.itemId, description: 'Imported Widget', quantity: 10, unitPrice: 2 }] }),
  });
  if (!stockBillRes.ok) throw new Error('Foreign-currency stock receipt failed');
  const itemsAfter = await (await fetch(`${base}/api/inventory/items`, { headers })).json();
  const widget = itemsAfter.items.find((i) => i.id === itemBody.itemId);
  const inventoryCostConvertedOk = Number(widget.cost_price) === 30; // 2 USD/unit x rate 15 = 30 GHS/unit
  log('inventory cost converted to base currency', widget);

  // 7. Books still balance after all of this.
  const trialBalance = await (await fetch(`${base}/api/reports/trial-balance`, { headers })).json();
  const balancedOk = trialBalance.balanced === true;
  log('trial balance', { balanced: trialBalance.balanced });

  const ok = autoRateOk && ledgerInBaseCurrencyOk && manualRateOk && noRateBlockedOk && backwardCompatOk && expenseOk && inventoryCostConvertedOk && balancedOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`autoRateOk=${autoRateOk} ledgerInBaseCurrencyOk=${ledgerInBaseCurrencyOk} manualRateOk=${manualRateOk} noRateBlockedOk=${noRateBlockedOk}`);
  console.log(`backwardCompatOk=${backwardCompatOk} expenseOk=${expenseOk} inventoryCostConvertedOk=${inventoryCostConvertedOk} balancedOk=${balancedOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
