-- Electronic signatures. `signatures` holds each user's saved signature (drawn once,
-- reused thereafter); the actual signing of a specific approval decision snapshots
-- that image onto the approval_requests row itself (migration 012), so a later change
-- to someone's saved signature never rewrites history.

CREATE TABLE signatures (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signature_data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id)
);

CREATE INDEX idx_signatures_company ON signatures(company_id);

-- A "Travel & Per Diem" expense account so Per Diem claims (approval workflow,
-- migration 012) have somewhere to post once approved — added for every company that
-- already exists, and folded into seedAccounts.js's defaults for every company created
-- from now on.
INSERT INTO accounts (company_id, code, name, type, group_name)
SELECT id, '5080', 'Travel & Per Diem', 'expense', 'Travel & Per Diem' FROM companies
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = companies.id AND a.code = '5080');
