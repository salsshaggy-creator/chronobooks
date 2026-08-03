-- ChronoBooks V1 — Payroll integration (SQLite mirror, dev/demo only)
-- Additive migration: builds on 001-003, does not modify them.

CREATE TABLE payroll_imports (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chronosync_run_id TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  total_gross NUMERIC NOT NULL DEFAULT 0,
  total_net NUMERIC NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  journal_entry_id TEXT REFERENCES journal_entries(id),
  imported_by TEXT REFERENCES users(id),
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, chronosync_run_id)
);

CREATE INDEX idx_payroll_imports_company ON payroll_imports(company_id);
