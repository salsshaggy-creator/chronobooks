-- ChronoBooks — Void/Reverse for posted transactions (SQLite mirror, dev/demo only)
-- Additive migration: builds on 001_init.sql (journal_entries) and 002/003 (invoices/bills).

ALTER TABLE journal_entries ADD COLUMN voided_at TEXT;
ALTER TABLE journal_entries ADD COLUMN voided_by TEXT REFERENCES users(id);
ALTER TABLE journal_entries ADD COLUMN reversal_of TEXT REFERENCES journal_entries(id);
