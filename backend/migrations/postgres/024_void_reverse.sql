-- ChronoBooks — Void/Reverse for posted transactions (PostgreSQL / Railway)
-- Additive migration: builds on 001_init.sql (journal_entries) and 002/003 (invoices/bills).
--
-- Posted financial transactions are never hard-edited or hard-deleted (that would erase
-- the audit trail and can silently unbalance the ledger). Instead, voiding a transaction
-- posts an equal-and-opposite reversing journal entry and flags the original as void, so
-- both the original and the reversal remain visible in the ledger forever.

ALTER TABLE journal_entries ADD COLUMN voided_at TIMESTAMPTZ;
ALTER TABLE journal_entries ADD COLUMN voided_by UUID REFERENCES users(id);
ALTER TABLE journal_entries ADD COLUMN reversal_of UUID REFERENCES journal_entries(id);
