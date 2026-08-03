const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { seedChartOfAccounts } = require('../db/seedAccounts');
const { seedParameters } = require('../db/seedParameters');

/** Every company on the platform — Super Administrator only ("System Super Administrator... creates companies"). */
async function listCompanies(req, res) {
  const result = await db.query(`SELECT id, name, industry, company_type, currency, country, created_at FROM companies ORDER BY created_at DESC`, []);
  res.json({ companies: result.rows });
}

/**
 * Create Company (write-up: "Super Administrator creates the first Company
 * Administrator, who then manages that company's users"). Provisions a new company
 * row, its default Chart of Accounts, a Head Office branch, and its first Company
 * Administrator in one step — the same shape as seed.js's demo company, minus the
 * demo transactions.
 */
async function createCompany(req, res) {
  const { companyName, currency, country, industry, companyType, adminFirstName, adminLastName, adminEmail, adminPassword } = req.body;

  if (!companyName || !adminFirstName || !adminLastName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'Company name and the first Company Administrator\'s name, email, and password are required.' });
  }
  if (adminPassword.length < 8) return res.status(400).json({ error: 'Administrator password must be at least 8 characters.' });

  const companyId = crypto.randomUUID();
  await db.query(
    `INSERT INTO companies (id, name, currency, country, industry, company_type, brand_accent_color)
     VALUES ($1,$2,$3,$4,$5,$6,'indigo')`,
    [companyId, companyName, currency || 'GHS', country || null, industry || null, companyType || null]
  );

  await seedChartOfAccounts(companyId);
  await seedParameters(companyId);

  const branchId = crypto.randomUUID();
  await db.query(`INSERT INTO branches (id, company_id, name, is_head_office) VALUES ($1,$2,'Head Office',1)`, [branchId, companyId]);

  const existingUser = await db.query(`SELECT id FROM users WHERE company_id = $1 AND email = $2`, [companyId, adminEmail]);
  if (existingUser.rows[0]) return res.status(409).json({ error: 'A user with that email already exists in this company.' });

  const adminRole = await db.query(`SELECT id FROM roles WHERE code = 'administrator'`, []);
  const adminUserId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const fullName = `${adminFirstName} ${adminLastName}`.trim();
  await db.query(
    `INSERT INTO users (id, company_id, email, password_hash, full_name, first_name, last_name, role_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [adminUserId, companyId, adminEmail, passwordHash, fullName, adminFirstName, adminLastName, adminRole.rows[0].id]
  );
  await db.query(`INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2)`, [adminUserId, companyId]);
  await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1,$2)`, [adminUserId, branchId]);

  res.status(201).json({ id: companyId, name: companyName, adminUserId, adminEmail });
}

module.exports = { listCompanies, createCompany };
