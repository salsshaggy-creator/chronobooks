-- ChronoBooks — Chart of Accounts sub-accounts (PostgreSQL / Railway)
-- Additive migration: builds on 001_init.sql (accounts).
--
-- Lets a user nest an account under another, e.g. "Momo" under "Cash", or "Stanbic"
-- and "Absa" under "Bank Accounts". A sub-account is a real, independently-posted
-- ledger account (its own balance, its own journal lines) -- parent_account_id is
-- purely an organizational label for the Chart of Accounts view and account pickers;
-- it never changes how postings or balances are calculated.

ALTER TABLE accounts ADD COLUMN parent_account_id INTEGER REFERENCES accounts(id);
CREATE INDEX idx_accounts_parent ON accounts(parent_account_id);
