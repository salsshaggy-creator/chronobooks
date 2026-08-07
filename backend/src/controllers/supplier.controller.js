const crypto = require('crypto');
const db = require('../config/db');

async function listSuppliers(req, res) {
  const { companyId } = req.user;
  const result = await db.query(
    `SELECT s.*,
       COALESCE((SELECT SUM(b.total - b.paid) FROM bills b WHERE b.supplier_id = s.id AND b.status != 'void'), 0) as outstanding_balance
     FROM suppliers s
     WHERE s.company_id = $1
     ORDER BY s.name`,
    [companyId]
  );
  res.json({ suppliers: result.rows });
}

async function createSupplier(req, res) {
  const { companyId } = req.user;
  const { name, email, phone, tin, paymentTerms } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required.' });

  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO suppliers (id, company_id, name, email, phone, tin, payment_terms)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, companyId, name, email || null, phone || null, tin || null, paymentTerms || null]
  );
  res.status(201).json({ id });
}

async function updateSupplier(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const { name, email, phone, tin, paymentTerms } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Supplier name is required.' });

  const existing = await db.query(`SELECT id FROM suppliers WHERE id = $1 AND company_id = $2`, [id, companyId]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Supplier not found.' });

  await db.query(
    `UPDATE suppliers SET name = $1, email = $2, phone = $3, tin = $4, payment_terms = $5 WHERE id = $6 AND company_id = $7`,
    [name.trim(), email || null, phone || null, tin || null, paymentTerms || null, id, companyId]
  );
  res.json({ ok: true });
}

/** Same rule as customers: master data can be hard-deleted only while no bill references it. */
async function deleteSupplier(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;

  const existing = await db.query(`SELECT id FROM suppliers WHERE id = $1 AND company_id = $2`, [id, companyId]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Supplier not found.' });

  const billCount = await db.query(`SELECT COUNT(*) as count FROM bills WHERE supplier_id = $1`, [id]);
  if (Number(billCount.rows[0].count) > 0) {
    return res.status(400).json({ error: 'This supplier has bills on record and can’t be deleted. You can still edit their details.' });
  }

  await db.query(`DELETE FROM suppliers WHERE id = $1 AND company_id = $2`, [id, companyId]);
  res.json({ ok: true });
}

/**
 * GET /suppliers/:id/statement?from=&to= — the supplier's payable ledger: every bill (a
 * credit — it increases what's owed to them) and every payment (a debit — it reduces what's
 * owed), in date order, with a running balance. Same void-exclusion rule as the customer
 * statement — see customer.controller.js's getCustomerStatement for the rationale.
 */
async function getSupplierStatement(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const { from, to } = req.query;

  const supRes = await db.query(`SELECT * FROM suppliers WHERE id = $1 AND company_id = $2`, [id, companyId]);
  const supplier = supRes.rows[0];
  if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });

  const billRes = await db.query(
    `SELECT bill_date as date, bill_number as reference, 'bill' as type, total as amount
     FROM bills WHERE supplier_id = $1 AND company_id = $2 AND status != 'void'`,
    [id, companyId]
  );
  const payRes = await db.query(
    `SELECT p.payment_date as date, b.bill_number as reference, 'payment' as type, p.amount as amount
     FROM supplier_payments p JOIN bills b ON b.id = p.bill_id
     WHERE p.bill_id IN (SELECT id FROM bills WHERE supplier_id = $1 AND company_id = $2)`,
    [id, companyId]
  );

  const all = [...billRes.rows, ...payRes.rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.type === 'bill' ? -1 : 1)));

  let openingBalance = 0;
  const inRange = [];
  for (const t of all) {
    const isBeforeRange = from && t.date < from;
    if (isBeforeRange) {
      openingBalance += t.type === 'bill' ? Number(t.amount) : -Number(t.amount);
    } else if ((!to || t.date <= to)) {
      inRange.push(t);
    }
  }

  let balance = openingBalance;
  const transactions = inRange.map((t) => {
    const credit = t.type === 'bill' ? Number(t.amount) : 0;
    const debit = t.type === 'payment' ? Number(t.amount) : 0;
    balance += credit - debit;
    return {
      date: t.date,
      type: t.type,
      reference: t.reference,
      description: t.type === 'bill' ? `Bill ${t.reference}` : `Payment made — ${t.reference}`,
      debit,
      credit,
      balance,
    };
  });

  res.json({ supplier, openingBalance, transactions, closingBalance: balance });
}

module.exports = { listSuppliers, createSupplier, updateSupplier, deleteSupplier, getSupplierStatement };
