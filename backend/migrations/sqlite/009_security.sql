-- Security section (write-up: Password Policy, Audit Logs, Sessions; MFA is marked
-- "(Future)" in the write-up itself, so it's intentionally not built here).

CREATE TABLE login_history (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  success INTEGER NOT NULL,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_history_company ON login_history(company_id, created_at);
CREATE INDEX idx_login_history_user ON login_history(user_id, created_at);

ALTER TABLE companies ADD COLUMN password_min_length INTEGER NOT NULL DEFAULT 8;
ALTER TABLE companies ADD COLUMN password_require_uppercase INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN password_require_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN password_require_symbol INTEGER NOT NULL DEFAULT 0;
