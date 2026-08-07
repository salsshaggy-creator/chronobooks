const crypto = require('crypto');
const db = require('../config/db');

async function listCustomers(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT c.*,
       COALESCE((SELECT SUM(i.total - i.paid) FROM invoices i WHERE i.customer_id = c.id AND i.status != 'void'), 0) as outstanding_balance
     FROM customers c
     WHERE c.company_id = $1
     ORDER BY c.name`,
    [companyId]
  );
  res.json({ customers: result.rows });
}

async function createCustomer(req, res) {
  const { companyId } = req.user;
  const { name, email, phone, tin, paymentTerms, creditLimit } = req.body;
  if (!name) return res.status(400).json({ error: 'Customer name is required.' });

  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO customers (id, company_id, name, email, phone, tin, payment_terms, credit_limit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, companyId, name, email || null, phone || null, tin || null, paymentTerms || null, Number(creditLimit || 0)]
  );
  res.status(201).json({ id });
}

async function updateCustomer(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const { name, email, phone, tin, paymentTerms, creditLimit } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Customer name is required.' });

  const existing = await db.query(`SELECT id FROM customers WHERE id = $1 AND company_id = $2`, [id, companyId]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Customer not found.' });

  await db.query(
    `UPDATE customers SET name = $1, email = $2, phone = $3, tin = $4, payment_terms = $5, credit_limit = $6 WHERE id = $7 AND company_id = $8`,
    [name.trim(), email || null, phone || null, tin || null, paymentTerms || null, Number(creditLimit || 0), id, companyId]
  );
  res.json({ ok: true });
}

/**
 * Master data (customers) can be hard-deleted, unlike posted financial transactions --
 * but only while nothing points at them, so a stray invoice never ends up referencing a
 * customer that no longer exists.
 */
async function deleteCustomer(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;

  const existing = await db.query(`SELECT id FROM customers WHERE id = $1 AND company_id = $2`, [id, companyId]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Customer not found.' });

  const invCount = await db.query(`SELECT COUNT(*) as count FROM invoices WHERE customer_id = $1`, [id]);
  if (Number(invCount.rows[0].count) > 0) {
    return res.status(400).json({ error: 'This customer has invoices on record and can’t be deleted. You can still edit their details.' });
  }

  await db.query(`DELETE FROM customers WHERE id = $1 AND company_id = $2`, [id, companyId]);
  res.json({ ok: true });
}

/**
 * GET /customers/:id/statement?from=&to= — the customer's receivable ledger: every invoice
 * (a debit — it increases what they owe) and every receipt (a credit — it reduces what they
 * owe), in date order, with a running balance. Void invoices are left out entirely since
 * their receivable impact was already reversed (and a voided invoice can never have a
 * receipt against it — void is blocked once anything's been paid).
 *
 * `from`/`to` are optional. When given, everything dated before `from` is folded into a
 * single "Balance brought forward" opening line instead of being listed transaction-by-transaction.
 */
async function getCustomerStatement(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const { from, to } = req.query;

  const custRes = await db.query(`SELECT * FROM customers WHERE id = $1 AND company_id = $2`, [id, companyId]);
  const customer = custRes.rows[0];
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });

  const invRes = await db.query(
    `SELECT invoice_date as date, invoice_number as reference, 'invoice' as type, total as amount
     FROM invoices WHERE customer_id = $1 AND company_id = $2 AND status != 'void'`,
    [id, companyId]
  );
  const recRes = await db.query(
    `SELECT r.receipt_date as date, i.invoice_number as reference, 'receipt' as type, r.amount as amount
     FROM receipts r JOIN invoices i ON i.id = r.invoice_id
     WHERE r.invoice_id IN (SELECT id FROM invoices WHERE customer_id = $1 AND company_id = $2)`,
    [id, companyId]
  );

  const all = [...invRes.rows, ...recRes.rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.type === 'invoice' ? -1 : 1)));

  let openingBalance = 0;
  const inRange = [];
  for (const t of all) {
    const isBeforeRange = from && t.date < from;
    if (isBeforeRange) {
      openingBalance += t.type === 'invoice' ? Number(t.amount) : -Number(t.amount);
    } else if ((!to || t.date <= to)) {
      inRange.push(t);
    }
  }

  let balance = openingBalance;
  const transactions = inRange.map((t) => {
    const debit = t.type === 'invoice' ? Number(t.amount) : 0;
    const credit = t.type === 'receipt' ? Number(t.amount) : 0;
    balance += debit - credit;
    return {
      date: t.date,
      type: t.type,
      reference: t.reference,
      description: t.type === 'invoice' ? `Invoice ${t.reference}` : `Payment received — ${t.reference}`,
      debit,
      credit,
      balance,
    };
  });

  res.json({ customer, openingBalance, transactions, closingBalance: balance });
}

module.exports = { listCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomerStatement };
