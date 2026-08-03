-- ChronoBooks V1 — Purchases & Supplier Bills (PostgreSQL)
-- Additive migration: builds on 001_init.sql and 002_sales.sql, does not modify them.

CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  bill_number TEXT NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE,
  expense_account_id INTEGER NOT NULL REFERENCES accounts(id),
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted',   -- posted | partially_paid | paid | void
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, bill_number)
);

CREATE INDEX idx_bills_company_date ON bills(company_id, bill_date);
CREATE INDEX idx_bills_supplier ON bills(supplier_id);

CREATE TABLE bill_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(18,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(18,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(18,2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_bill_lines_bill ON bill_lines(bill_id);

-- Supplier payments: money going out against a bill (Debit Accounts Payable, Credit Bank/Cash)
CREATE TABLE supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES bills(id),
  payment_date DATE NOT NULL,
  paid_from_account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  reference TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_payments_company_date ON supplier_payments(company_id, payment_date);
CREATE INDEX idx_supplier_payments_bill ON supplier_payments(bill_id);
