-- ChronoBooks V1 schema (SQLite mirror, for local dev / sandbox verification only)
-- Production runs on the PostgreSQL migration in migrations/postgres/001_init.sql on Railway.
-- Column types and generated ids are adapted for SQLite; shape matches the Postgres schema 1:1.

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

INSERT INTO roles (code, name) VALUES
  ('administrator', 'Administrator'),
  ('accountant', 'Accountant'),
  ('cashier', 'Cashier'),
  ('read_only', 'Read Only');

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  refresh_token_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, email)
);

CREATE INDEX idx_users_company ON users(company_id);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  group_name TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_accounts_company ON accounts(company_id);

CREATE TABLE bank_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bank_accounts_company ON bank_accounts(company_id);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  tin TEXT,
  email TEXT,
  phone TEXT,
  credit_limit NUMERIC DEFAULT 0,
  payment_terms TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_customers_company ON customers(company_id);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tin TEXT,
  email TEXT,
  phone TEXT,
  payment_terms TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_suppliers_company ON suppliers(company_id);

CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,
  reference TEXT,
  description TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  created_by TEXT REFERENCES users(id),
  posted INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_journal_entries_company_date ON journal_entries(company_id, entry_date);

CREATE TABLE journal_lines (
  id TEXT PRIMARY KEY,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  paid_from_account_id INTEGER NOT NULL REFERENCES accounts(id),
  supplier_id TEXT REFERENCES suppliers(id),
  reference TEXT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  tax NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'posted',
  journal_entry_id TEXT REFERENCES journal_entries(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_expenses_company_date ON expenses(company_id, expense_date);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_company ON audit_log(company_id, created_at);
