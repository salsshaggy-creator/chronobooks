-- Bank Reconciliation: match the bank statement's ending balance against the ledger for
-- a single bank account, marking which posted transactions have actually cleared the
-- bank as of a statement date. Purely additive -- no existing posting logic changes;
-- this only reads journal_lines/journal_entries (already the source of truth for every
-- other report) and records, once a reconciliation balances to zero difference, which
-- entries were cleared so they never show up as outstanding again for that account.
-- Gated by the existing "bank_reconciliation_enabled" toggle (off by default,
-- scaffolded since Milestone 1).

CREATE TABLE bank_reconciliations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  -- Monotonic per-bank-account counter (assigned as MAX(seq)+1, same pattern as invoice/
  -- bill numbering elsewhere) so "which reconciliation happened last" never depends on
  -- created_at's 1-second resolution -- two reconciliations completed in the same
  -- second must still have an unambiguous order, since each one's balancing math
  -- depends on knowing exactly what the previous one reconciled to.
  seq INTEGER NOT NULL,
  statement_date TEXT NOT NULL,
  statement_balance NUMERIC NOT NULL,
  book_balance NUMERIC NOT NULL,
  cleared_total NUMERIC NOT NULL,
  outstanding_total NUMERIC NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bank_reconciliations_account ON bank_reconciliations(bank_account_id);

-- Once a journal entry is included in a completed reconciliation for a given bank
-- account, it's permanently "cleared" for that account and won't be offered again as an
-- outstanding candidate in a future reconciliation. A transfer between two of the
-- company's own bank accounts posts one journal entry touching both accounts' GL lines,
-- so clearing is tracked per (bank_account_id, journal_entry_id) pair, not globally --
-- each side of the transfer gets reconciled against its own statement independently.
CREATE TABLE reconciled_transactions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  reconciliation_id TEXT NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
  cleared_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (bank_account_id, journal_entry_id)
);
CREATE INDEX idx_reconciled_transactions_account ON reconciled_transactions(bank_account_id);
