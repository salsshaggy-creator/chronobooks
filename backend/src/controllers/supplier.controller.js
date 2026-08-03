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

module.exports = { listSuppliers, createSupplier };
