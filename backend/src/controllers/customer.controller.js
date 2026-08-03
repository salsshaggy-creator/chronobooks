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

module.exports = { listCustomers, createCustomer };
