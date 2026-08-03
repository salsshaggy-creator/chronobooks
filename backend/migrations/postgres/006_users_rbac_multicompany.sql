-- User Management completeness, Branches/Departments, Role Management (RBAC), and
-- multi-company access. Additive only.

ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN employee_number TEXT;

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_head_office BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_branches_company ON branches(company_id);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_departments_company ON departments(company_id);

CREATE TABLE user_branches (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE user_departments (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id)
);

-- Role-Based Access Control: a real permission catalog instead of hard-coded role
-- checks. Route-level enforcement still uses the small set of role codes already
-- wired via requireRole() — this is the foundation (catalog + editable mapping) the
-- write-up's closing paragraph asks for, not a rewrite of every controller.
CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Multi-company access: which companies a user can switch into. A Super
-- Administrator bypasses this table entirely (implicit access to every company).
CREATE TABLE user_companies (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, company_id)
);

INSERT INTO roles (code, name) VALUES
  ('super_administrator', 'Super Administrator'),
  ('finance_manager', 'Finance Manager'),
  ('accounts_payable_officer', 'Accounts Payable Officer'),
  ('accounts_receivable_officer', 'Accounts Receivable Officer'),
  ('inventory_officer', 'Inventory Officer'),
  ('auditor', 'Auditor');

UPDATE roles SET name = 'Company Administrator' WHERE code = 'administrator';
UPDATE roles SET name = 'Read Only User' WHERE code = 'read_only';

-- Permission catalog (write-up Section 5).
INSERT INTO permissions (code, label, category) VALUES
  ('company.create', 'Create Company', 'Company'),
  ('company.edit', 'Edit Company', 'Company'),
  ('company.delete', 'Delete Company', 'Company'),
  ('users.create', 'Create Users', 'Users'),
  ('users.edit', 'Edit Users', 'Users'),
  ('users.reset_password', 'Reset Password', 'Users'),
  ('users.lock', 'Lock Users', 'Users'),
  ('accounting.post_journal', 'Post Journal', 'Accounting'),
  ('accounting.reverse_journal', 'Reverse Journal', 'Accounting'),
  ('accounting.approve_journal', 'Approve Journal', 'Accounting'),
  ('customers.add', 'Add Customer', 'Customers'),
  ('customers.edit', 'Edit Customer', 'Customers'),
  ('customers.delete', 'Delete Customer', 'Customers'),
  ('suppliers.add', 'Add Supplier', 'Suppliers'),
  ('suppliers.edit', 'Edit Supplier', 'Suppliers'),
  ('banking.reconciliation', 'Bank Reconciliation', 'Banking'),
  ('banking.transfers', 'Bank Transfers', 'Banking'),
  ('inventory.stock_issue', 'Stock Issue', 'Inventory'),
  ('inventory.stock_receipt', 'Stock Receipt', 'Inventory'),
  ('inventory.stock_adjustment', 'Stock Adjustment', 'Inventory'),
  ('reports.trial_balance', 'Trial Balance', 'Reports'),
  ('reports.income_statement', 'Income Statement', 'Reports'),
  ('reports.balance_sheet', 'Balance Sheet', 'Reports'),
  ('reports.general_ledger', 'General Ledger', 'Reports'),
  ('reports.cash_flow', 'Cash Flow', 'Reports'),
  ('reports.vat', 'VAT Reports', 'Reports'),
  ('payroll.import', 'Import Payroll', 'Payroll Integration'),
  ('payroll.post_journal', 'Post Payroll Journal', 'Payroll Integration'),
  ('system.backup', 'Backup', 'System'),
  ('system.restore', 'Restore', 'System'),
  ('system.audit_log', 'Audit Log', 'System'),
  ('system.licensing', 'Licensing', 'System'),
  ('system.parameters', 'Parameters', 'System');

-- Default role -> permission mapping. Editable afterwards via the Role Management screen.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = 'super_administrator';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'administrator' AND p.code NOT IN ('company.create', 'company.delete', 'system.licensing');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'accountant' AND (p.category IN ('Accounting', 'Reports', 'Payroll Integration') OR p.code = 'banking.reconciliation');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'finance_manager' AND p.category IN ('Accounting', 'Reports', 'Banking', 'Customers', 'Suppliers', 'Payroll Integration');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'accounts_payable_officer' AND (p.category = 'Suppliers' OR p.code IN ('banking.transfers', 'reports.trial_balance'));

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'accounts_receivable_officer' AND (p.category = 'Customers' OR p.code = 'reports.trial_balance');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'cashier' AND p.code IN ('banking.transfers', 'customers.add');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'inventory_officer' AND p.category = 'Inventory';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'auditor' AND (p.category = 'Reports' OR p.code = 'system.audit_log');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'read_only' AND p.category = 'Reports';
