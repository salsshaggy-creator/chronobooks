-- Parameters (write-up System Administration > Parameters): currencies, exchange
-- rates, tax codes, cost centres, payment terms, number sequences, document types.

CREATE TABLE currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL
);
INSERT INTO currencies (code, name, symbol) VALUES
  ('GHS', 'Ghanaian Cedi', 'GH₵'),
  ('USD', 'US Dollar', '$'),
  ('GBP', 'British Pound', '£'),
  ('EUR', 'Euro', '€'),
  ('NGN', 'Nigerian Naira', '₦');

CREATE TABLE exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  as_of_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_exchange_rates_company ON exchange_rates(company_id);

CREATE TABLE tax_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rate NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (company_id, code)
);

CREATE TABLE cost_centres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (company_id, code)
);

CREATE TABLE payment_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE number_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  prefix TEXT NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  UNIQUE (company_id, document_type)
);

CREATE TABLE document_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
