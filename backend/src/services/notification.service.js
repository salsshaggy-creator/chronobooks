const crypto = require('crypto');
const db = require('../config/db');

// Same approver set Approvals uses (backend/src/controllers/approval.controller.js) --
// duplicated as a plain constant rather than imported, since importing the controller
// here would pull in invoice/bill/receipt/expense/payroll controllers transitively for
// no reason. Keep these two in sync if the approver role set ever changes.
const APPROVER_ROLES = ['administrator', 'finance_manager', 'super_administrator'];

const MAX_PER_CATEGORY = 8;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysOverdue(dueDate) {
  const ms = new Date(today()) - new Date(dueDate);
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

async function overdueInvoices(companyId) {
  const res = await db.query(
    `SELECT i.id, i.invoice_number, i.due_date, i.total, i.paid, c.name as customer_name
     FROM invoices i JOIN customers c ON c.id = i.customer_id
     WHERE i.company_id = $1 AND i.status NOT IN ('paid','void') AND i.due_date IS NOT NULL AND i.due_date < $2
     ORDER BY i.due_date ASC`,
    [companyId, today()]
  );
  return res.rows.map((r) => ({
    key: `invoice_overdue:${r.id}`,
    type: 'invoice_overdue',
    severity: 'warning',
    title: `Invoice ${r.invoice_number} is overdue`,
    message: `${r.customer_name} — ${Number(r.total) - Number(r.paid)} outstanding, due ${r.due_date} (${daysOverdue(r.due_date)}d overdue).`,
    link: '/sales',
  }));
}

async function overdueBills(companyId) {
  const res = await db.query(
    `SELECT b.id, b.bill_number, b.due_date, b.total, b.paid, s.name as supplier_name
     FROM bills b JOIN suppliers s ON s.id = b.supplier_id
     WHERE b.company_id = $1 AND b.status NOT IN ('paid','void') AND b.due_date IS NOT NULL AND b.due_date < $2
     ORDER BY b.due_date ASC`,
    [companyId, today()]
  );
  return res.rows.map((r) => ({
    key: `bill_overdue:${r.id}`,
    type: 'bill_overdue',
    severity: 'warning',
    title: `Bill ${r.bill_number} is overdue`,
    message: `${r.supplier_name} — ${Number(r.total) - Number(r.paid)} outstanding, due ${r.due_date} (${daysOverdue(r.due_date)}d overdue).`,
    link: '/purchases',
  }));
}

async function lowStockItems(companyId) {
  const companyRes = await db.query(`SELECT inventory_enabled FROM companies WHERE id = $1`, [companyId]);
  if (!companyRes.rows[0] || !companyRes.rows[0].inventory_enabled) return [];

  const res = await db.query(
    `SELECT id, name, sku, quantity_on_hand, reorder_level FROM inventory_items
     WHERE company_id = $1 AND is_active = true AND reorder_level > 0 AND quantity_on_hand <= reorder_level
     ORDER BY quantity_on_hand ASC`,
    [companyId]
  );
  return res.rows.map((r) => ({
    key: `low_stock:${r.id}`,
    type: 'low_stock',
    severity: Number(r.quantity_on_hand) <= 0 ? 'danger' : 'warning',
    title: `${r.name} is low on stock`,
    message: `${Number(r.quantity_on_hand).toLocaleString()} on hand${r.sku ? ` (${r.sku})` : ''}, reorder level is ${Number(r.reorder_level).toLocaleString()}.`,
    link: '/inventory',
  }));
}

async function recurringDue(companyId) {
  const companyRes = await db.query(`SELECT recurring_transactions_enabled FROM companies WHERE id = $1`, [companyId]);
  if (!companyRes.rows[0] || !companyRes.rows[0].recurring_transactions_enabled) return [];

  const res = await db.query(
    `SELECT id, name, type, next_run_date FROM recurring_transactions
     WHERE company_id = $1 AND is_active = true AND next_run_date <= $2
     ORDER BY next_run_date ASC`,
    [companyId, today()]
  );
  return res.rows.map((r) => ({
    key: `recurring_due:${r.id}:${r.next_run_date}`,
    type: 'recurring_due',
    severity: r.next_run_date < today() ? 'warning' : 'info',
    title: `"${r.name}" is due to run`,
    message: `Recurring ${r.type} — next run was scheduled for ${r.next_run_date}. Post it from the Recurring page.`,
    link: '/recurring',
  }));
}

/**
 * A single aggregated item rather than one per request -- the count itself is what's
 * actionable, and it naturally disappears once the approver clears their queue on the
 * Approvals page, so it isn't individually dismissable the way the other types are.
 */
async function approvalsPending(companyId, userId, role) {
  const approver = APPROVER_ROLES.includes(role);
  const clauses = [`ar.company_id = $1`, `ar.status = 'pending'`];
  const params = [companyId];
  if (!approver) clauses.push(`ar.requested_by = $${params.push(userId)}`);

  const res = await db.query(`SELECT COUNT(*) as count FROM approval_requests ar WHERE ${clauses.join(' AND ')}`, params);
  const count = Number(res.rows[0].count);
  if (count === 0) return [];

  return [{
    key: `approvals_pending:${userId}`,
    type: 'approvals_pending',
    severity: 'info',
    title: approver ? `${count} request${count === 1 ? '' : 's'} waiting for your approval` : `You have ${count} request${count === 1 ? '' : 's'} still awaiting approval`,
    message: approver ? 'Review and decide from the Approvals inbox.' : "You'll be notified once someone reviews it.",
    link: '/approvals',
    dismissable: false,
  }];
}

async function getDismissedKeys(userId) {
  const res = await db.query(`SELECT notification_key FROM notification_dismissals WHERE user_id = $1`, [userId]);
  return new Set(res.rows.map((r) => r.notification_key));
}

async function listNotifications(companyId, userId, role) {
  const [invoices, bills, lowStock, recurring, approvals] = await Promise.all([
    overdueInvoices(companyId),
    overdueBills(companyId),
    lowStockItems(companyId),
    recurringDue(companyId),
    approvalsPending(companyId, userId, role),
  ]);

  const dismissed = await getDismissedKeys(userId);

  const cap = (items) => {
    const visible = items.filter((n) => !dismissed.has(n.key));
    if (visible.length <= MAX_PER_CATEGORY) return visible;
    const shown = visible.slice(0, MAX_PER_CATEGORY);
    shown.push({
      key: `${items[0]?.type || 'more'}:overflow`,
      type: items[0]?.type,
      severity: 'info',
      title: `+${visible.length - MAX_PER_CATEGORY} more`,
      message: 'See the full list on the relevant page.',
      link: items[0]?.link,
      dismissable: false,
    });
    return shown;
  };

  const notifications = [
    ...cap(invoices),
    ...cap(bills),
    ...cap(lowStock),
    ...cap(recurring),
    ...approvals, // never capped -- it's already a single aggregated item
  ].map((n) => ({ dismissable: n.dismissable !== false, ...n }));

  return { notifications, count: notifications.length };
}

async function dismiss(companyId, userId, key) {
  await db.query(
    `INSERT INTO notification_dismissals (id, company_id, user_id, notification_key) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, notification_key) DO NOTHING`,
    [crypto.randomUUID(), companyId, userId, key]
  );
  return { ok: true };
}

async function dismissAll(companyId, userId, role) {
  const { notifications } = await listNotifications(companyId, userId, role);
  for (const n of notifications) {
    if (n.dismissable) await dismiss(companyId, userId, n.key);
  }
  return { ok: true };
}

module.exports = { listNotifications, dismiss, dismissAll };
