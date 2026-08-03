-- Recurring Transactions: a Sales invoice, Purchases bill, or Expense template that
-- auto-posts on a schedule (rent, subscriptions, retainer invoices) -- turned on
-- cosmetically via the "Recurring transactions" toggle, though (matching Budgeting,
-- Cost Centres, and Bank Reconciliation) the page itself is always reachable from the
-- sidebar; the toggle doesn't gate the API.
--
-- payload is the exact same JSON body buildInvoice/buildBill/buildExpense already
-- accept (customerId/supplierId, category, tax rate, currency, cost centre, lines,
-- etc.) minus the date field, which gets substituted with each occurrence's date when
-- it runs -- this is why creating a recurring transaction never needs its own
-- duplicate validation or posting logic; "running" one just calls the exact same
-- buildX function every direct create already calls.
ALTER TABLE companies ADD COLUMN recurring_transactions_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE recurring_transactions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,               -- 'invoice' | 'bill' | 'expense'
  name TEXT NOT NULL,               -- friendly label, e.g. "Monthly office rent"
  payload TEXT NOT NULL,            -- JSON body for buildInvoice/buildBill/buildExpense
  frequency TEXT NOT NULL,          -- 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  due_days INTEGER,                 -- invoice/bill only: due date = occurrence date + due_days
  start_date TEXT NOT NULL,
  next_run_date TEXT NOT NULL,
  end_date TEXT,                    -- nullable: stop generating after this date
  is_active INTEGER NOT NULL DEFAULT 1,
  last_run_date TEXT,
  occurrences_posted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recurring_transactions_company ON recurring_transactions(company_id);

-- History of what actually got posted each time a recurring transaction ran, linking
-- back to the real invoice/bill/expense record it created.
CREATE TABLE recurring_transaction_runs (
  id TEXT PRIMARY KEY,
  recurring_transaction_id TEXT NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
  run_date TEXT NOT NULL,
  result_type TEXT NOT NULL,        -- 'invoice' | 'bill' | 'expense'
  result_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recurring_transaction_runs_parent ON recurring_transaction_runs(recurring_transaction_id);
