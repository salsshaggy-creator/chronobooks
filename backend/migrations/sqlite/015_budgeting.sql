-- Budgeting: a planned amount per income/expense account per calendar month, compared
-- against what actually posted through the same auto-journal engine every other module
-- uses. No new accounts, no new journal entries — a budget is purely a plan, it never
-- posts anything. Gated by the existing "budgeting_enabled" toggle (off by default,
-- scaffolded since Milestone 1) so nothing changes for a company that doesn't use it.

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  period TEXT NOT NULL,              -- 'YYYY-MM'
  amount NUMERIC NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, account_id, period)
);

CREATE INDEX idx_budgets_company_period ON budgets(company_id, period);
