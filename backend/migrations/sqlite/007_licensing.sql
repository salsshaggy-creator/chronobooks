-- License Management (mirrors ChronoSync's licensing module, adapted to ChronoBooks'
-- Company + Users licensing basis instead of employee count).

ALTER TABLE companies ADD COLUMN license_type TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE companies ADD COLUMN plan_name TEXT NOT NULL DEFAULT 'Demo / Trial';
ALTER TABLE companies ADD COLUMN user_limit INTEGER NOT NULL DEFAULT 5;
ALTER TABLE companies ADD COLUMN license_key TEXT;
ALTER TABLE companies ADD COLUMN customer_ref TEXT;
ALTER TABLE companies ADD COLUMN license_activated_at TEXT;
ALTER TABLE companies ADD COLUMN license_expires_at TEXT;
ALTER TABLE companies ADD COLUMN license_last_renewed_at TEXT;
ALTER TABLE companies ADD COLUMN ai_assistant_allowance TEXT NOT NULL DEFAULT 'none';

-- Extra module toggles beyond the Accounting Preferences set (migration 005) — these
-- are the ones a Super Administrator grants per-license rather than a Company
-- Administrator self-enabling in Settings.
ALTER TABLE companies ADD COLUMN procurement_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN manufacturing_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN pos_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN consolidation_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE pricing_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_name TEXT NOT NULL,
  companies_included TEXT NOT NULL,
  users_included TEXT NOT NULL,
  annual_fee TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pricing_addons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  annual_fee TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO pricing_tiers (plan_name, companies_included, users_included, annual_fee, sort_order) VALUES
  ('Starter', '1', '2', '$250', 1),
  ('Professional', '1', '5', '$500', 2),
  ('Business', '1', '10', '$900', 3),
  ('Corporate', '1', '25', '$1,800', 4),
  ('Enterprise', 'Unlimited', 'Unlimited', 'Custom Quote', 5);

INSERT INTO pricing_addons (label, annual_fee, sort_order) VALUES
  ('Additional Company', '$150/year', 1),
  ('Additional User', '$40/year', 2),
  ('Inventory Module', '+$150/year', 3),
  ('Fixed Assets Module', '+$120/year', 4),
  ('Procurement Module', '+$200/year', 5),
  ('Manufacturing Module', 'Custom', 6);
