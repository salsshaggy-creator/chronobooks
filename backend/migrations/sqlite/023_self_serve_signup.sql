-- Self-serve signup: public registration, email verification (stubbed -- no real email
-- provider configured yet, so verification/reset links are returned directly in the API
-- response instead of emailed), a first-run company setup wizard, and a 30-day trial that
-- gates into an upgrade-request flow once expired.

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN verification_token TEXT;
ALTER TABLE users ADD COLUMN verification_token_expires_at TEXT;
ALTER TABLE users ADD COLUMN reset_token TEXT;
ALTER TABLE users ADD COLUMN reset_token_expires_at TEXT;

-- self_serve marks a company created through public /signup (as opposed to one a Super
-- Administrator provisioned) -- these start capped at 2 users and can never create a
-- second company. setup_completed defaults true so every pre-existing company (seeded
-- demo, admin-provisioned) is treated as already-set-up; self-serve registration
-- explicitly sets it false until the new admin finishes the company-details wizard.
ALTER TABLE companies ADD COLUMN self_serve INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN setup_completed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN requested_plan_name TEXT;
ALTER TABLE companies ADD COLUMN plan_requested_at TEXT;

-- Which of the license module toggles (license.controller.js MODULE_FIELDS) come bundled
-- in each pricing tier, plus a numeric user limit so the upgrade-request screen can show
-- real numbers instead of parsing the free-text users_included column. Both stay editable
-- only via direct migration/DB update for now -- the existing pricing-tier editor
-- (Super Admin > License) edits plan_name/companies_included/users_included/annual_fee,
-- which is the part that actually needs to be live-adjustable per the "if I change the
-- price it should change what customers see" requirement.
ALTER TABLE pricing_tiers ADD COLUMN modules_included TEXT NOT NULL DEFAULT '';
ALTER TABLE pricing_tiers ADD COLUMN user_limit_numeric INTEGER;

UPDATE pricing_tiers SET modules_included = '', user_limit_numeric = 2 WHERE plan_name = 'Starter';
UPDATE pricing_tiers SET modules_included = 'inventoryEnabled', user_limit_numeric = 5 WHERE plan_name = 'Professional';
UPDATE pricing_tiers SET modules_included = 'inventoryEnabled,fixedAssetsEnabled,budgetingEnabled', user_limit_numeric = 10 WHERE plan_name = 'Business';
UPDATE pricing_tiers SET modules_included = 'inventoryEnabled,fixedAssetsEnabled,budgetingEnabled,procurementEnabled,multiCurrencyEnabled', user_limit_numeric = 25 WHERE plan_name = 'Corporate';
UPDATE pricing_tiers SET modules_included = 'inventoryEnabled,fixedAssetsEnabled,budgetingEnabled,procurementEnabled,multiCurrencyEnabled,manufacturingEnabled,posEnabled,consolidationEnabled', user_limit_numeric = NULL WHERE plan_name = 'Enterprise';
