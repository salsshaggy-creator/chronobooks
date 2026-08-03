-- ChronoBooks V1 schema (PostgreSQL / Railway)
-- Mirrors the ChronoSync convention: SQL migrations, indexed tables, FK relationships, audit logging.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tin TEXT,
  vat_number TEXT,
  address TEXT,
  email TEXT,
  phone TEXT,
  currency TEXT NOT NULL DEFAULT 'GHS',
  country TEXT,
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  brand_accent_color TEXT NOT NULL DEFAULT 'indigo',
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,          -- administrator | accountant | cashier | read_only
  name TEXT NOT NULL
);

INSERT INTO roles (code, name) VALUES
  ('administrator', 'Administrator'),
  ('accountant', 'Accountant'),
  ('cashier', 'Cashier'),
  ('read_only', 'Read Only');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  refresh_token_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

CREATE INDEX idx_users_company ON users(company_id);

-- Chart of accounts (hidden from end users, drives the auto-journal engine)
CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  group_name TEXT NOT NULL,           -- e.g. Bank, Cash, Accounts Receivable, Salary Expense
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_accounts_company ON accounts(company_id);

CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_accounts_company ON bank_accounts(company_id);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  tin TEXT,
  email TEXT,
  phone TEXT,
  credit_limit NUMERIC(18,2) DEFAULT 0,
  payment_terms TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_company ON customers(company_id);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tin TEXT,
  email TEXT,
  phone TEXT,
  payment_terms TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_company ON suppliers(company_id);

-- Journal entries: the double-entry engine that every business event posts into.
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  reference TEXT,
  description TEXT,
  source_type TEXT NOT NULL,          -- expense | invoice | payment | receipt | transfer | manual | payroll
  source_id UUID,
  created_by UUID REFERENCES users(id),
  posted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_entries_company_date ON journal_entries(company_id, entry_date);

CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  debit NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL,
  paid_from_account_id INTEGER NOT NULL REFERENCES accounts(id),
  supplier_id UUID REFERENCES suppliers(id),
  reference TEXT,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  tax NUMERIC(18,2) NOT NULL DEFAULT 0,
  description TEXT,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'posted',   -- draft | posted
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_company_date ON expenses(company_id, expense_date);

-- Audit log: who did what, when (Section 3.4 / user roles requirement)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_company ON audit_log(company_id, created_at);
