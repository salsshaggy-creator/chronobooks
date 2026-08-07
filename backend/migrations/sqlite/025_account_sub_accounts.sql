-- ChronoBooks — Chart of Accounts sub-accounts (SQLite mirror, dev/demo only)
-- Additive migration: builds on 001_init.sql (accounts).

ALTER TABLE accounts ADD COLUMN parent_account_id INTEGER REFERENCES accounts(id);
CREATE INDEX idx_accounts_parent ON accounts(parent_account_id);
