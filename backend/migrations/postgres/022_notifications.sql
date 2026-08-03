-- Notifications & Reminders: rather than storing notifications themselves (which would
-- need to be kept perfectly in sync with invoices/bills/stock levels/recurring rules as
-- they change), every notification is computed live, on request, straight from the data
-- that's already there (overdue invoices, overdue bills, low stock, recurring rules that
-- are due, a pending-approvals count). The only thing that actually needs to persist is
-- which ones a given user has already dismissed, keyed by a stable, deterministic string
-- (e.g. "invoice_overdue:<invoiceId>") so a dismissal survives across logins but a brand
-- new overdue item still shows up under its own new key.

CREATE TABLE notification_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_key)
);
CREATE INDEX idx_notification_dismissals_user ON notification_dismissals(company_id, user_id);
