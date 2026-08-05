const crypto = require('crypto');
const db = require('../config/db');

async function listBranches(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT id, name, is_head_office FROM branches WHERE company_id = $1 ORDER BY is_head_office DESC, name`, [companyId]);
  res.json({ branches: result.rows.map((b) => ({ ...b, isHeadOffice: !!b.is_head_office })) });
}

async function createBranch(req, res) {
  const { companyId } = req.user;
  const { name, isHeadOffice } = req.body;
  if (!name) return res.status(400).json({ error: 'Branch name is required.' });
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO branches (id, company_id, name, is_head_office) VALUES ($1,$2,$3,$4)`, [id, companyId, name, isHeadOffice ? '1' : '0']);
  res.status(201).json({ id, name });
}

async function listDepartments(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT id, name FROM departments WHERE company_id = $1 ORDER BY name`, [companyId]);
  res.json({ departments: result.rows });
}

async function createDepartment(req, res) {
  const { companyId } = req.user;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required.' });
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO departments (id, company_id, name) VALUES ($1,$2,$3)`, [id, companyId, name]);
  res.status(201).json({ id, name });
}

module.exports = { listBranches, createBranch, listDepartments, createDepartment };
