-- Multi-Currency: record a Sales invoice, Purchases bill, or Expense in a foreign
-- currency, converted to the company's own (base) currency for the books. The ledger
-- itself never changes shape — journal_lines stay single-currency, exactly as every
-- report already assumes — these columns just remember what currency and rate a
-- transaction was originally entered in, purely for display on that record. subtotal/
-- tax/total (already existing columns) keep meaning "in the company's base currency",
-- unchanged; foreign_total is the equivalent amount in the original currency.
-- Nullable/defaulted so every existing row and every company not using this module
-- (the default) behaves exactly as before.

ALTER TABLE invoices ADD COLUMN currency TEXT;
ALTER TABLE invoices ADD COLUMN exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN foreign_total NUMERIC(18,2);

ALTER TABLE bills ADD COLUMN currency TEXT;
ALTER TABLE bills ADD COLUMN exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE bills ADD COLUMN foreign_total NUMERIC(18,2);

ALTER TABLE expenses ADD COLUMN currency TEXT;
ALTER TABLE expenses ADD COLUMN exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE expenses ADD COLUMN foreign_total NUMERIC(18,2);
