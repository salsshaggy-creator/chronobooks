// Smoke test for the Inventory module: turning it on, adding an item, receiving stock
// via a Purchases bill (weighted-average cost), issuing stock via a Sales invoice
// (Cost of Goods Sold posts automatically), the negative-stock guard and its opt-out,
// manual stock adjustments (their own journal entry), low-stock flagging, and that the
// books stay balanced throughout.
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

  // Turn Inventory on (off by default — this proves the toggle actually gates the module).
  const enableRes = await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ inventoryEnabled: true, allowNegativeStock: false }) });
  log('enabled inventory', { status: enableRes.status });
  if (!enableRes.ok) throw new Error('Could not enable inventory');

  const suppliersBody = await (await fetch(`${base}/api/suppliers`, { headers })).json();
  const supplier = suppliersBody.suppliers[0];
  const customersBody = await (await fetch(`${base}/api/customers`, { headers })).json();
  const customer = customersBody.customers[0];

  // 1. Create an item with a reorder level so we can test the low-stock flag later.
  const createItemRes = await fetch(`${base}/api/inventory/items`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: 'Bag of Rice (50kg)', sku: 'RICE-50', unit: 'bag', category: 'Groceries', salePrice: 450, reorderLevel: 20 }),
  });
  const createItemBody = await createItemRes.json();
  log('created item', { status: createItemRes.status, body: createItemBody });
  if (!createItemRes.ok) throw new Error('Item creation failed');
  const itemId = createItemBody.itemId;

  // Reject: an itemized line on a bill whose category isn't "Inventory".
  const badCategoryRes = await fetch(`${base}/api/bills`, {
    method: 'POST', headers,
    body: JSON.stringify({ supplierId: supplier.id, billDate: '2026-07-25', expenseCategory: 'Office Supplies', lines: [{ itemId, description: 'x', quantity: 10, unitPrice: 300 }] }),
  });
  const badCategoryBlockedOk = badCategoryRes.status === 400;
  log('bill with item line but wrong category blocked', { status: badCategoryRes.status, blockedOk: badCategoryBlockedOk });

  // 2. Receive stock: a Purchases bill, category "Inventory", 100 bags @ GHS 300.
  const billRes = await fetch(`${base}/api/bills`, {
    method: 'POST', headers,
    body: JSON.stringify({ supplierId: supplier.id, billDate: '2026-07-25', expenseCategory: 'Inventory', lines: [{ itemId, description: 'Bag of Rice (50kg)', quantity: 100, unitPrice: 300 }] }),
  });
  const billBody = await billRes.json();
  log('received stock via bill', { status: billRes.status, body: billBody });
  if (!billRes.ok) throw new Error('Stock receipt bill failed');

  const afterReceipt = await (await fetch(`${base}/api/inventory/items`, { headers })).json();
  const itemAfterReceipt = afterReceipt.items.find((i) => i.id === itemId);
  log('item after receipt', itemAfterReceipt);
  const receiptOk = Number(itemAfterReceipt.quantity_on_hand) === 100 && Number(itemAfterReceipt.cost_price) === 300;

  // 3. Receive a second batch at a different cost -> weighted average should blend: (100*300 + 50*360) / 150 = 320.
  const bill2Res = await fetch(`${base}/api/bills`, {
    method: 'POST', headers,
    body: JSON.stringify({ supplierId: supplier.id, billDate: '2026-07-26', expenseCategory: 'Inventory', lines: [{ itemId, description: 'Bag of Rice (50kg)', quantity: 50, unitPrice: 360 }] }),
  });
  if (!bill2Res.ok) throw new Error('Second stock receipt failed');
  const afterSecondReceipt = await (await fetch(`${base}/api/inventory/items`, { headers })).json();
  const itemAfterSecondReceipt = afterSecondReceipt.items.find((i) => i.id === itemId);
  log('item after second receipt (weighted avg)', itemAfterSecondReceipt);
  const weightedAvgOk = Number(itemAfterSecondReceipt.quantity_on_hand) === 150 && Math.abs(Number(itemAfterSecondReceipt.cost_price) - 320) < 0.01;

  // 4. Issue stock via a Sales invoice: sell 60 bags @ GHS 450 -> COGS = 60 * 320 = 19200.
  const invoiceRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-07-27', incomeCategory: 'Sales', lines: [{ itemId, description: 'Bag of Rice (50kg)', quantity: 60, unitPrice: 450 }] }),
  });
  const invoiceBody = await invoiceRes.json();
  log('issued stock via invoice', { status: invoiceRes.status, body: invoiceBody });
  if (!invoiceRes.ok) throw new Error('Stock issue invoice failed');
  const cogsOk = Math.abs(Number(invoiceBody.costOfGoodsSold) - 19200) < 0.01;

  const afterIssue = await (await fetch(`${base}/api/inventory/items`, { headers })).json();
  const itemAfterIssue = afterIssue.items.find((i) => i.id === itemId);
  log('item after issue', itemAfterIssue);
  const issueOk = Number(itemAfterIssue.quantity_on_hand) === 90 && Math.abs(Number(itemAfterIssue.cost_price) - 320) < 0.01; // cost doesn't move on issue

  // 5. Oversell blocked when negative stock isn't allowed (only 90 on hand).
  const overSellRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-07-27', incomeCategory: 'Sales', lines: [{ itemId, description: 'Bag of Rice (50kg)', quantity: 500, unitPrice: 450 }] }),
  });
  const overSellBlockedOk = overSellRes.status === 400;
  log('oversell blocked', { status: overSellRes.status, blockedOk: overSellBlockedOk });

  // 6. Turn "allow negative stock" on and the same oversell now succeeds, going negative.
  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ allowNegativeStock: true }) });
  const overSellRetryRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-07-27', incomeCategory: 'Sales', lines: [{ itemId, description: 'Bag of Rice (50kg)', quantity: 100, unitPrice: 450 }] }),
  });
  const overSellRetryOk = overSellRetryRes.ok;
  const afterOversell = await (await fetch(`${base}/api/inventory/items`, { headers })).json();
  const itemAfterOversell = afterOversell.items.find((i) => i.id === itemId);
  log('negative stock allowed', { status: overSellRetryRes.status, quantityOnHand: itemAfterOversell.quantity_on_hand });
  const negativeAllowedOk = overSellRetryOk && Number(itemAfterOversell.quantity_on_hand) === -10;
  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ allowNegativeStock: false }) });

  // 7. Manual adjustment: found 60 more bags at GHS 320/bag (stock take correction) -> back to positive, posts its own journal entry.
  const adjustRes = await fetch(`${base}/api/inventory/items/${itemId}/adjust`, {
    method: 'POST', headers, body: JSON.stringify({ quantityDelta: 60, unitCost: 320, reason: 'Stock take correction' }),
  });
  const adjustBody = await adjustRes.json();
  log('manual increase adjustment', { status: adjustRes.status, body: adjustBody });
  const adjustIncreaseOk = adjustRes.ok && adjustBody.quantityOnHand === 50 && !!adjustBody.journalEntryId;

  // 8. Adjustment requires a reason.
  const noReasonRes = await fetch(`${base}/api/inventory/items/${itemId}/adjust`, { method: 'POST', headers, body: JSON.stringify({ quantityDelta: 5, reason: '' }) });
  const reasonRequiredOk = noReasonRes.status === 400;

  // 9. Movement history has an entry per event so far: 2 receipts, 2 successful sales
  // (the blocked oversell attempt never wrote a movement), 1 adjustment.
  const movementsBody = await (await fetch(`${base}/api/inventory/items/${itemId}/movements`, { headers })).json();
  log('movement history', { count: movementsBody.movements.length, types: movementsBody.movements.map((m) => m.movement_type) });
  const movementsOk = movementsBody.movements.length === 5;

  // 10. Low-stock item: opening quantity below its reorder level should be flagged.
  const lowItemRes = await fetch(`${base}/api/inventory/items`, {
    method: 'POST', headers, body: JSON.stringify({ name: 'Bag of Sugar (25kg)', sku: 'SUGAR-25', unit: 'bag', reorderLevel: 20, openingQuantity: 5, openingCost: 200 }),
  });
  const lowItemBody = await lowItemRes.json();
  const itemsAfterLow = await (await fetch(`${base}/api/inventory/items`, { headers })).json();
  const lowItem = itemsAfterLow.items.find((i) => i.id === lowItemBody.itemId);
  log('low stock item', lowItem);
  const lowStockOk = lowItem.lowStock === true;

  // 11. Books still balance after every one of the above.
  const trialBalance = await (await fetch(`${base}/api/reports/trial-balance`, { headers })).json();
  log('trial balance', { totalDebit: trialBalance.totalDebit, totalCredit: trialBalance.totalCredit, balanced: trialBalance.balanced });
  const balancedOk = trialBalance.balanced === true;

  const ok = badCategoryBlockedOk && receiptOk && weightedAvgOk && cogsOk && issueOk && overSellBlockedOk
    && negativeAllowedOk && adjustIncreaseOk && reasonRequiredOk && movementsOk && lowStockOk && balancedOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`badCategoryBlockedOk=${badCategoryBlockedOk} receiptOk=${receiptOk} weightedAvgOk=${weightedAvgOk} cogsOk=${cogsOk} issueOk=${issueOk}`);
  console.log(`overSellBlockedOk=${overSellBlockedOk} negativeAllowedOk=${negativeAllowedOk} adjustIncreaseOk=${adjustIncreaseOk} reasonRequiredOk=${reasonRequiredOk}`);
  console.log(`movementsOk=${movementsOk} lowStockOk=${lowStockOk} balancedOk=${balancedOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
