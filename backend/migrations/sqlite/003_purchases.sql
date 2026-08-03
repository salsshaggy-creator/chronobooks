-- ChronoBooks V1 — Purchases & Supplier Bills (SQLite mirror, dev/demo only)
-- Additive migration: builds on 001_init.sql and 002_sales.sql, does not modify them.

CREATE TABLE bills (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  bill_number TEXT NOT NULL,
  bill_date TEXT NOT NULL,
  due_date TEXT,
  expense_account_id INTEGER NOT NULL REFERENCES accounts(id),
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  paid NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted',
  journal_entry_id TEXT REFERENCES journal_entries(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, bill_number)
);

CREATE INDEX idx_bills_company_date ON bills(company_id, bill_date);
CREATE INDEX idx_bills_supplier ON bills(supplier_id);

CREATE TABLE bill_lines (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX idx_bill_lines_bill ON bill_lines(bill_id);

CREATE TABLE supplier_payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bill_id TEXT NOT NULL REFERENCES bills(id),
  payment_date TEXT NOT NULL,
  paid_from_account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  reference TEXT,
  journal_entry_id TEXT REFERENCES journal_entries(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_supplier_payments_company_date ON supplier_payments(company_id, payment_date);
CREATE INDEX idx_supplier_payments_bill ON supplier_payments(bill_id);
