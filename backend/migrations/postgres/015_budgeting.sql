-- Budgeting: a planned amount per income/expense account per calendar month, compared
-- against what actually posted through the same auto-journal engine every other module
-- uses. No new accounts, no new journal entries — a budget is purely a plan, it never
-- posts anything. Gated by the existing "budgeting_enabled" toggle (off by default,
-- scaffolded since Milestone 1) so nothing changes for a company that doesn't use it.

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  period TEXT NOT NULL,              -- 'YYYY-MM'
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, account_id, period)
);

CREATE INDEX idx_budgets_company_period ON budgets(company_id, period);
