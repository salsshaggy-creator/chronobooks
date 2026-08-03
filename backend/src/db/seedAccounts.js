const db = require('../config/db');

// Default Chart of Accounts (write-up Section 3) — created automatically for every
// new company, whether that's the one demo company from seed.js or a brand new one
// provisioned through the Super Administrator's "create company" flow.
const DEFAULT_ACCOUNTS = [
  ['1000', 'Cash', 'asset', 'Cash'],
  ['1010', 'Main Bank Account', 'asset', 'Bank Accounts'],
  ['1100', 'Accounts Receivable', 'asset', 'Accounts Receivable'],
  ['1200', 'Inventory', 'asset', 'Inventory'],
  ['1500', 'Fixed Assets', 'asset', 'Fixed Assets'],
  ['1510', 'Accumulated Depreciation', 'asset', 'Accumulated Depreciation'],
  ['2000', 'Accounts Payable', 'liability', 'Accounts Payable'],
  ['2050', 'Loans', 'liability', 'Loans'],
  ['2100', 'VAT Payable', 'liability', 'VAT Payable'],
  ['2200', 'PAYE Payable', 'liability', 'PAYE Payable'],
  ['2300', 'SSNIT Employee Payable', 'liability', 'SSNIT Employee Payable'],
  ['2310', 'SSNIT Employer Payable', 'liability', 'SSNIT Employer Payable'],
  ['2320', 'Tier2 Employee Payable', 'liability', 'Tier2 Employee Payable'],
  ['2330', 'Tier2 Employer Payable', 'liability', 'Tier2 Employer Payable'],
  ['2400', 'Net Salaries Payable', 'liability', 'Net Salaries Payable'],
  ['3000', 'Capital', 'equity', 'Capital'],
  ['3100', 'Retained Earnings', 'equity', 'Retained Earnings'],
  ['4000', 'Sales', 'income', 'Sales'],
  ['4100', 'Service Income', 'income', 'Service Income'],
  ['4150', 'Other Income', 'income', 'Other Income'],
  ['4160', 'Gain on Disposal of Assets', 'income', 'Gain on Disposal of Assets'],
  ['4200', 'Interest Income', 'income', 'Interest Income'],
  ['5000', 'Salary Expense', 'expense', 'Salary Expense'],
  ['5001', 'SSNIT Employer Expense', 'expense', 'SSNIT Employer Expense'],
  ['5002', 'Tier2 Employer Expense', 'expense', 'Tier2 Employer Expense'],
  ['5010', 'Fuel', 'expense', 'Fuel'],
  ['5020', 'Utilities', 'expense', 'Utilities'],
  ['5030', 'Rent', 'expense', 'Rent'],
  ['5040', 'Office Supplies', 'expense', 'Office Supplies'],
  ['5050', 'Marketing', 'expense', 'Marketing'],
  ['5060', 'Bank Charges', 'expense', 'Bank Charges'],
  ['5070', 'Repairs', 'expense', 'Repairs'],
  ['5080', 'Travel & Per Diem', 'expense', 'Travel & Per Diem'],
  ['5090', 'Cost of Goods Sold', 'expense', 'Cost of Goods Sold'],
  ['5095', 'Inventory Adjustments', 'expense', 'Inventory Adjustments'],
  ['5100', 'Depreciation Expense', 'expense', 'Depreciation Expense'],
  ['5110', 'Loss on Disposal of Assets', 'expense', 'Loss on Disposal of Assets'],
  ['5999', 'Miscellaneous', 'expense', 'Miscellaneous'],
];

async function seedChartOfAccounts(companyId) {
  const accountIds = {};
  for (const [code, name, type, groupName] of DEFAULT_ACCOUNTS) {
    const res = await db.query(
      `INSERT INTO accounts (company_id, code, name, type, group_name) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [companyId, code, name, type, groupName]
    );
    accountIds[code] = res.rows[0]?.id;
  }
  return accountIds;
}

module.exports = { DEFAULT_ACCOUNTS, seedChartOfAccounts };
