-- Approval Workflow — a single generic queue that covers every module that needs a
-- decision before it takes effect (Sales invoices, Purchase bills, Receipts, Per Diem
-- expenses, Payroll imports) plus free-standing documents that just need a signature.
-- When a company's toggle for a module is off (the default), that module behaves
-- exactly as it always has — created and posted immediately. When it's on, the create
-- endpoint queues an approval_requests row instead of creating the real record, and
-- the real record (with its usual auto-journal posting) is only created once an
-- approver signs off — reusing the exact same, already-tested creation logic.

CREATE TABLE approval_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('sales_invoice','purchase_bill','receipt','per_diem_expense','payroll_import','document')),
  payload TEXT NOT NULL,               -- JSON: the original request body needed to build the record on approval
  description TEXT NOT NULL,           -- human-readable summary for the inbox, e.g. "Invoice to Kofi Mensah Traders"
  amount NUMERIC,
  currency TEXT,
  requested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approver_id TEXT REFERENCES users(id),
  decided_at TEXT,
  comments TEXT,
  signature_data TEXT,                 -- the approver's signature, snapshotted at the moment of decision
  result_module_id TEXT,               -- the id of the record actually created once approved (invoiceId, billId, ...)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_approval_requests_company_status ON approval_requests(company_id, status);
CREATE INDEX idx_approval_requests_requested_by ON approval_requests(requested_by);

-- Per-module opt-in toggles (all default off — no existing behavior changes unless a
-- company explicitly turns one on). "Sales" covers invoices, "Purchases" covers bills.
ALTER TABLE companies ADD COLUMN approval_required_sales INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN approval_required_purchases INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN approval_required_receipts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN approval_required_expenses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN approval_required_payroll INTEGER NOT NULL DEFAULT 0;

-- Per Diem is a new expense type (destination/days/daily rate, amount auto-computed as
-- days * daily rate) layered onto the existing expenses table rather than a new one.
ALTER TABLE expenses ADD COLUMN expense_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE expenses ADD COLUMN destination TEXT;
ALTER TABLE expenses ADD COLUMN days NUMERIC;
ALTER TABLE expenses ADD COLUMN daily_rate NUMERIC;
