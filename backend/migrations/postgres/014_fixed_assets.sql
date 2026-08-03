-- Fixed Assets: a register of things the business owns long-term (equipment, vehicles,
-- furniture), with straight-line monthly depreciation and disposal. Mirrors the
-- Inventory module's shape: a register table + a movement/run ledger table for audit
-- history, gated by its own company toggle (fixed_assets_enabled, already existed as
-- scaffolding from Milestone 1/License), off by default so nothing changes unless a
-- company turns it on.

CREATE TABLE fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_number TEXT,
  category TEXT,
  purchase_date DATE NOT NULL,
  purchase_cost NUMERIC(18,2) NOT NULL,
  salvage_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  useful_life_months INTEGER NOT NULL,
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line')),
  accumulated_depreciation NUMERIC(18,2) NOT NULL DEFAULT 0,
  last_depreciated_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed')),
  disposal_date DATE,
  disposal_proceeds NUMERIC(18,2),
  disposal_journal_entry_id UUID REFERENCES journal_entries(id),
  acquisition_journal_entry_id UUID REFERENCES journal_entries(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixed_assets_company ON fixed_assets(company_id);

-- One row per depreciation run per asset — the audit trail behind each period's
-- Debit Depreciation Expense / Credit Accumulated Depreciation posting (several assets
-- depreciated in the same run share one journal_entry_id, same pattern as an invoice's
-- Cost of Goods Sold entry covering several item lines).
CREATE TABLE depreciation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_depreciation_runs_company_asset ON depreciation_runs(company_id, asset_id);

-- Accounts a fixed-asset register needs beyond the "1500 Fixed Assets" asset account
-- that has existed since V1: Accumulated Depreciation (contra-asset — carries a credit
-- balance, so its net reduces Total Assets on the Balance Sheet the normal way), the
-- Depreciation Expense that posts each run, and Gain/Loss on Disposal for when an asset
-- is sold for more or less than its book value. Backfilled for every company that
-- already exists; folded into seedAccounts.js for every company created from now on.
INSERT INTO accounts (company_id, code, name, type, group_name)
SELECT id, '1510', 'Accumulated Depreciation', 'asset', 'Accumulated Depreciation' FROM companies
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = companies.id AND a.code = '1510');

INSERT INTO accounts (company_id, code, name, type, group_name)
SELECT id, '5100', 'Depreciation Expense', 'expense', 'Depreciation Expense' FROM companies
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = companies.id AND a.code = '5100');

INSERT INTO accounts (company_id, code, name, type, group_name)
SELECT id, '4160', 'Gain on Disposal of Assets', 'income', 'Gain on Disposal of Assets' FROM companies
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = companies.id AND a.code = '4160');

INSERT INTO accounts (company_id, code, name, type, group_name)
SELECT id, '5110', 'Loss on Disposal of Assets', 'expense', 'Loss on Disposal of Assets' FROM companies
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = companies.id AND a.code = '5110');
