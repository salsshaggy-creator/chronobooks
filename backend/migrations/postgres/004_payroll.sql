-- ChronoBooks V1 — Payroll integration (PostgreSQL)
-- Additive migration: builds on 001-003, does not modify them.
--
-- ChronoBooks does not run its own payroll — ChronoSync's payroll engine already
-- produces balanced GL batches via CFIE (gl_journal_batches / gl_journal_lines).
-- Rather than fork into a second ledger, ChronoBooks mirrors a posted payroll run as
-- a single balanced journal entry in its own ledger. This table just tracks which
-- ChronoSync run IDs have already been mirrored, so the same run can't be imported twice.

CREATE TABLE payroll_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chronosync_run_id TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  total_gross NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_net NUMERIC(18,2) NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  journal_entry_id UUID REFERENCES journal_entries(id),
  imported_by UUID REFERENCES users(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, chronosync_run_id)
);

CREATE INDEX idx_payroll_imports_company ON payroll_imports(company_id);
