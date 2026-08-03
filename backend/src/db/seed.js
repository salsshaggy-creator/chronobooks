require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { postJournalEntry } = require('../services/journal.service');
const { seedChartOfAccounts } = require('./seedAccounts');
const { seedParameters } = require('./seedParameters');

async function seed() {
  const companyId = crypto.randomUUID();
  await db.query(
    `INSERT INTO companies (
       id, name, trading_name, registration_number, tin, vat_number, ssnit_employer_number,
       industry, company_type, fiscal_year_start_month, fiscal_year_end_month, currency, country,
       timezone, language, phone, mobile, email, website, address, region, city, brand_accent_color,
       vat_registered, vat_rate, nhil_rate, getfund_rate, withholding_tax_enabled, corporate_tax_rate, default_tax_method
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
    [
      companyId, 'Demo SME Ltd', 'Demo SME', 'BN-2024-001122', 'TIN-000123', 'VAT-000123', 'SSN-EMP-4471',
      'Retail', 'Limited Liability Company', 1, 12, 'GHS', 'Ghana',
      'Africa/Accra', 'English', '0302123456', '0244000000', 'accounts@demo-sme.com', 'https://demo-sme.com',
      '12 Independence Ave', 'Greater Accra', 'Accra', 'indigo',
      1, 15, 2.5, 2.5, 0, 25, 'exclusive',
    ]
  );

  // Demo/trial license (License Management module) — matches the "85 days left" style
  // trial banner: activated 17 days ago, 85 days still remaining from today.
  const today = new Date();
  const activatedAt = new Date(today.getTime() - 17 * 86400000).toISOString().slice(0, 10);
  const expiresAt = new Date(today.getTime() + 85 * 86400000).toISOString().slice(0, 10);
  await db.query(
    `UPDATE companies SET license_type=$1, plan_name=$2, user_limit=$3, license_key=$4, customer_ref=$5,
       license_activated_at=$6, license_expires_at=$7, ai_assistant_allowance=$8
     WHERE id=$9`,
    ['demo', 'Standard (Starter)', 20, 'CB-DEMO0-TRIAL0-000000', 'CUST-DEMO01', activatedAt, expiresAt, 'none', companyId]
  );

  const accountIds = await seedChartOfAccounts(companyId);
  await seedParameters(companyId);

  await db.query(
    `INSERT INTO bank_accounts (id, company_id, account_id, name, bank_name, branch, account_number, currency, swift_code, opening_balance, is_default)
     VALUES ($1,$2,(SELECT id FROM accounts WHERE company_id=$2 AND code='1010'),$3,$4,$5,$6,$7,$8,$9,$10)`,
    [crypto.randomUUID(), companyId, 'Main Bank Account', 'GCB Bank', 'Ridge Branch', '01123344556', 'GHS', 'GHCBGHAC', 25000, 1]
  );

  // Branches & Departments (write-up Section 4 examples).
  const branchIds = {};
  for (const [name, isHeadOffice] of [['Head Office', 1], ['Kumasi', 0], ['Takoradi', 0]]) {
    const res = await db.query(
      `INSERT INTO branches (id, company_id, name, is_head_office) VALUES ($1,$2,$3,$4) RETURNING id`,
      [crypto.randomUUID(), companyId, name, isHeadOffice]
    );
    branchIds[name] = res.rows[0].id;
  }
  const departmentIds = {};
  for (const name of ['Finance', 'HR', 'Procurement', 'Stores']) {
    const res = await db.query(
      `INSERT INTO departments (id, company_id, name) VALUES ($1,$2,$3) RETURNING id`,
      [crypto.randomUUID(), companyId, name]
    );
    departmentIds[name] = res.rows[0].id;
  }

  const demoCustomers = [
    ['Kofi Mensah Traders', 'kofi@mensahtraders.com', '0244000111'],
    ['Ama Boateng Ventures', 'ama@boatengventures.com', '0244000222'],
  ];
  for (const [name, email, phone] of demoCustomers) {
    await db.query(
      `INSERT INTO customers (id, company_id, name, email, phone) VALUES ($1,$2,$3,$4,$5)`,
      [crypto.randomUUID(), companyId, name, email, phone]
    );
  }

  const demoSuppliers = [
    ['Accra Office Supplies Ltd', 'sales@accraofficesupplies.com', '0302000111'],
    ['Volta Logistics Co', 'billing@voltalogistics.com', '0302000222'],
  ];
  for (const [name, email, phone] of demoSuppliers) {
    await db.query(
      `INSERT INTO suppliers (id, company_id, name, email, phone) VALUES ($1,$2,$3,$4,$5)`,
      [crypto.randomUUID(), companyId, name, email, phone]
    );
  }

  const passwordHash = await bcrypt.hash('ChronoBooks!123', 10);
  const adminRole = await db.query(`SELECT id FROM roles WHERE code = 'administrator'`, []);
  const userId = crypto.randomUUID();
  await db.query(
    `INSERT INTO users (id, company_id, email, password_hash, full_name, first_name, last_name, username, phone, role_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [userId, companyId, 'admin@demo-sme.com', passwordHash, 'Demo Admin', 'Demo', 'Admin', 'demo.admin', '0244000000', adminRole.rows[0].id]
  );
  await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1,$2)`, [userId, branchIds['Head Office']]);
  await db.query(`INSERT INTO user_departments (user_id, department_id) VALUES ($1,$2)`, [userId, departmentIds['Finance']]);
  await db.query(`INSERT INTO user_companies (user_id, company_id) VALUES ($1,$2)`, [userId, companyId]);

  // Super Administrator — the platform-level owner (write-up: "created during first
  // installation... not tied to a single company"). Homed on this demo company for the
  // NOT NULL company_id column, but every controller route + the company switcher treats
  // this role as having implicit access to every company, not just this one.
  const superAdminRole = await db.query(`SELECT id FROM roles WHERE code = 'super_administrator'`, []);
  const superAdminId = crypto.randomUUID();
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'salsshaggy@gmail.com';
  const superAdminPasswordHash = await bcrypt.hash('ChronoBooks!SuperAdmin1', 10);
  await db.query(
    `INSERT INTO users (id, company_id, email, password_hash, full_name, first_name, last_name, username, role_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [superAdminId, companyId, superAdminEmail, superAdminPasswordHash, 'Platform Super Admin', 'Platform', 'Super Admin', 'superadmin', superAdminRole.rows[0].id]
  );

  // Opening balance posted as a real journal entry (Debit Bank / Credit Capital), not a
  // bare number — this is what keeps the Trial Balance summing to zero and the Balance
  // Sheet actually balancing, matching spec Section 3.2.
  await postJournalEntry({
    companyId,
    entryDate: '2026-01-01',
    reference: 'OPENING',
    description: 'Opening balance',
    sourceType: 'opening_balance',
    sourceId: null,
    createdBy: userId,
    lines: [
      { accountId: accountIds['1010'], debit: 25000, credit: 0 },
      { accountId: accountIds['3000'], debit: 0, credit: 25000 },
    ],
  });

  console.log('Seed complete.');
  console.log('  Company:      ', companyId);
  console.log('  Admin login:  ', 'admin@demo-sme.com / ChronoBooks!123');
  console.log('  Super admin:  ', `${superAdminEmail} / ChronoBooks!SuperAdmin1`);
  await db.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
