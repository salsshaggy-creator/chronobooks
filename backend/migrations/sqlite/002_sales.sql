-- ChronoBooks V1 — Sales & Invoicing (SQLite mirror, dev/demo only)
-- Additive migration: builds on 001_init.sql, does not modify it.

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  income_account_id INTEGER NOT NULL REFERENCES accounts(id),
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  paid NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted',
  journal_entry_id TEXT REFERENCES journal_entries(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, invoice_number)
);

CREATE INDEX idx_invoices_company_date ON invoices(company_id, invoice_date);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);

CREATE TABLE invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  receipt_date TEXT NOT NULL,
  deposited_to_account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  reference TEXT,
  journal_entry_id TEXT REFERENCES journal_entries(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_receipts_company_date ON receipts(company_id, receipt_date);
CREATE INDEX idx_receipts_invoice ON receipts(invoice_id);
