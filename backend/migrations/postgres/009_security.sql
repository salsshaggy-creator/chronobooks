-- Security section (write-up: Password Policy, Audit Logs, Sessions; MFA is marked
-- "(Future)" in the write-up itself, so it's intentionally not built here).

CREATE TABLE login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_history_company ON login_history(company_id, created_at);
CREATE INDEX idx_login_history_user ON login_history(user_id, created_at);

ALTER TABLE companies ADD COLUMN password_min_length INTEGER NOT NULL DEFAULT 8;
ALTER TABLE companies ADD COLUMN password_require_uppercase BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN password_require_number BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN password_require_symbol BOOLEAN NOT NULL DEFAULT false;
