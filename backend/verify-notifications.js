// Smoke test for Notifications & Reminders: an overdue invoice, an overdue bill, a
// low-stock item, a due recurring rule, and a pending approval all show up; dismissing
// one hides it (idempotently) without touching the others; "Clear all" wipes every
// dismissable item but leaves the un-dismissable approvals count; and a non-approver only
// sees their own pending count, isolated from an admin's dismissal state.
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

  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ inventoryEnabled: true, recurringTransactionsEnabled: true }) });

  // 1. An overdue invoice (due date well in the past, still unpaid).
  const customer = (await (await fetch(`${base}/api/customers`, { headers })).json()).customers[0];
  const invRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers,
    body: JSON.stringify({ customerId: customer.id, invoiceDate: '2026-01-01', dueDate: '2026-01-15', incomeCategory: 'Sales', lines: [{ description: 'Overdue job', quantity: 1, unitPrice: 300 }] }),
  });
  const invoice = await invRes.json();

  // 2. An overdue bill.
  const supplier = (await (await fetch(`${base}/api/suppliers`, { headers })).json()).suppliers[0];
  const billRes = await fetch(`${base}/api/bills`, {
    method: 'POST', headers,
    body: JSON.stringify({ supplierId: supplier.id, billDate: '2026-01-01', dueDate: '2026-01-15', expenseCategory: 'Office Supplies', lines: [{ description: 'Overdue bill', quantity: 1, unitPrice: 150 }] }),
  });
  const bill = await billRes.json();

  // 3. A low-stock item (opens with less on hand than its reorder level).
  const itemRes = await fetch(`${base}/api/inventory/items`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: 'Low Stock Widget', sku: `LSW-${Date.now()}`, reorderLevel: 10, openingQuantity: 2, openingCost: 5 }),
  });
  const item = await itemRes.json();

  // 4. A recurring rule due today or earlier (start date in the past).
  const recRes = await fetch(`${base}/api/recurring`, {
    method: 'POST', headers,
    body: JSON.stringify({
      type: 'expense', name: 'Overdue Rent', frequency: 'monthly', startDate: '2026-01-01',
      payload: { category: 'Rent', paidFromAccountCode: '1010', amount: 500 },
    }),
  });
  const recurring = await recRes.json();

  // 5. A pending approval (a free-standing document request needs no toggle at all).
  await fetch(`${base}/api/approvals/documents`, { method: 'POST', headers, body: JSON.stringify({ title: 'Policy acknowledgment' }) });

  // 6. The admin's notification list should include all five.
  const listRes = await fetch(`${base}/api/notifications`, { headers });
  const list = await listRes.json();
  log('admin notifications', list);

  const invoiceKey = list.notifications.find((n) => n.type === 'invoice_overdue')?.key;
  const billKey = list.notifications.find((n) => n.type === 'bill_overdue')?.key;
  const lowStockKey = list.notifications.find((n) => n.type === 'low_stock')?.key;
  const recurringKey = list.notifications.find((n) => n.type === 'recurring_due')?.key;
  const approvalsItem = list.notifications.find((n) => n.type === 'approvals_pending');

  const allPresentOk = !!invoiceKey && !!billKey && !!lowStockKey && !!recurringKey && !!approvalsItem;
  const approvalNotDismissableOk = approvalsItem && approvalsItem.dismissable === false;
  const approvalCountOk = approvalsItem && approvalsItem.message.length > 0 && approvalsItem.title.includes('1');

  // 7. Dismissing the overdue invoice hides only that one, and is idempotent.
  const dismissRes = await fetch(`${base}/api/notifications/${encodeURIComponent(invoiceKey)}/dismiss`, { method: 'POST', headers });
  const dismissAgainRes = await fetch(`${base}/api/notifications/${encodeURIComponent(invoiceKey)}/dismiss`, { method: 'POST', headers });
  const dismissOk = dismissRes.ok && dismissAgainRes.ok;

  const listAfterDismiss = await (await fetch(`${base}/api/notifications`, { headers })).json();
  const invoiceGoneOk = !listAfterDismiss.notifications.some((n) => n.key === invoiceKey);
  const billStillThereOk = listAfterDismiss.notifications.some((n) => n.key === billKey);
  log('after dismissing invoice', { count: listAfterDismiss.count });

  // 8. "Clear all" wipes every dismissable item, but the approvals count survives.
  const clearAllRes = await fetch(`${base}/api/notifications/dismiss-all`, { method: 'POST', headers });
  const clearAllOk = clearAllRes.ok;
  const listAfterClearAll = await (await fetch(`${base}/api/notifications`, { headers })).json();
  const onlyApprovalsLeftOk = listAfterClearAll.notifications.length === 1 && listAfterClearAll.notifications[0].type === 'approvals_pending';
  log('after clear all', listAfterClearAll);

  // 9. A non-approver (cashier) who submitted their own document request sees their own
  //    "awaiting approval" reminder, isolated from the admin's dismissal state above.
  const roles = (await (await fetch(`${base}/api/roles`, { headers })).json()).roles;
  const cashierRole = roles.find((r) => r.code === 'cashier');
  const cashierEmail = `cashier-notif-${Date.now()}@demo-sme.com`;
  await fetch(`${base}/api/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ firstName: 'Notif', lastName: 'Cashier', email: cashierEmail, password: 'Cashier!12345', roleId: cashierRole.id }),
  });
  const cashierLogin = await login(cashierEmail, 'Cashier!12345');
  const cashierHeaders = { Authorization: `Bearer ${cashierLogin.accessToken}`, 'Content-Type': 'application/json' };

  const cashierListBefore = await (await fetch(`${base}/api/notifications`, { headers: cashierHeaders })).json();
  const cashierSeesNoApprovalsYetOk = !cashierListBefore.notifications.some((n) => n.type === 'approvals_pending');

  await fetch(`${base}/api/approvals/documents`, { method: 'POST', headers: cashierHeaders, body: JSON.stringify({ title: 'Cashier NDA' }) });
  const cashierListAfter = await (await fetch(`${base}/api/notifications`, { headers: cashierHeaders })).json();
  const cashierOwnApprovalOk = cashierListAfter.notifications.some((n) => n.type === 'approvals_pending' && n.title.includes('awaiting'));
  log('cashier notifications after submitting their own request', cashierListAfter);

  // Admin's own approvals count is unaffected by the cashier's submission's dismissal
  // state (there's nothing to dismiss on approvals_pending anyway, but confirm isolation
  // by checking the admin still sees a count of their own pending items, not the
  // cashier's).
  const adminListFinal = await (await fetch(`${base}/api/notifications`, { headers })).json();
  const adminApprovalsFinal = adminListFinal.notifications.find((n) => n.type === 'approvals_pending');
  const adminSeesCompanyWideCountOk = adminApprovalsFinal && adminApprovalsFinal.title.includes('2'); // policy ack + cashier NDA, both still pending

  // 10. Turning Inventory off makes low-stock notifications disappear.
  await fetch(`${base}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ inventoryEnabled: false }) });
  const listInventoryOff = await (await fetch(`${base}/api/notifications`, { headers })).json();
  const lowStockHiddenWhenDisabledOk = !listInventoryOff.notifications.some((n) => n.type === 'low_stock');
  log('after disabling inventory', { count: listInventoryOff.count });

  const ok = allPresentOk && approvalNotDismissableOk && approvalCountOk && dismissOk && invoiceGoneOk && billStillThereOk
    && clearAllOk && onlyApprovalsLeftOk && cashierSeesNoApprovalsYetOk && cashierOwnApprovalOk && adminSeesCompanyWideCountOk
    && lowStockHiddenWhenDisabledOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`allPresentOk=${allPresentOk} approvalNotDismissableOk=${approvalNotDismissableOk} approvalCountOk=${approvalCountOk} dismissOk=${dismissOk}`);
  console.log(`invoiceGoneOk=${invoiceGoneOk} billStillThereOk=${billStillThereOk} clearAllOk=${clearAllOk} onlyApprovalsLeftOk=${onlyApprovalsLeftOk}`);
  console.log(`cashierSeesNoApprovalsYetOk=${cashierSeesNoApprovalsYetOk} cashierOwnApprovalOk=${cashierOwnApprovalOk} adminSeesCompanyWideCountOk=${adminSeesCompanyWideCountOk} lowStockHiddenWhenDisabledOk=${lowStockHiddenWhenDisabledOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
