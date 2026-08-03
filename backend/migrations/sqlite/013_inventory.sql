-- Inventory module: simple items list with a weighted-average cost, plus a stock
-- movement ledger. Purchases already Debit whatever account the bill's category
-- resolves to — picking the "Inventory" category on a bill (account 1200, which has
-- existed in the Chart of Accounts since V1) is what makes it a stock receipt, so no
-- change to the bill-posting journal shape was needed. Selling an item posts one extra,
-- additive journal entry (Debit Cost of Goods Sold / Credit Inventory) alongside the
-- invoice's normal Debit AR / Credit Sales entry. Entirely opt-in: nothing here changes
-- existing Sales/Purchases behavior unless a line explicitly references an item.

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unit',
  category TEXT,
  cost_price NUMERIC NOT NULL DEFAULT 0,     -- running weighted-average unit cost
  sale_price NUMERIC,                        -- suggested selling price (optional, editable per invoice line)
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  reorder_level NUMERIC NOT NULL DEFAULT 0,  -- below this, the item is flagged "low stock"
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_inventory_items_company ON inventory_items(company_id);

-- Every change to quantity-on-hand, in one auditable ledger: purchases (stock in),
-- sales (stock out), and manual adjustments (stock take, damage, correction, opening
-- balance). journal_entry_id is set for adjustments and sales (their own dedicated
-- entry); purchases leave it null because the value movement is already covered by the
-- bill's own journal entry (source_type/source_id point back to the bill instead).
CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase','sale','adjustment','opening')),
  quantity NUMERIC NOT NULL,                 -- positive = stock in, negative = stock out
  unit_cost NUMERIC NOT NULL DEFAULT 0,      -- cost basis used for this movement
  reference TEXT,                            -- e.g. bill/invoice number, or an adjustment reason
  source_type TEXT,                          -- 'bill' | 'invoice' | 'adjustment'
  source_id TEXT,
  journal_entry_id TEXT REFERENCES journal_entries(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_stock_movements_company_item ON stock_movements(company_id, item_id);

-- Optional item reference on invoice/bill lines — when set, that line drives a stock
-- movement in addition to its normal financial posting. Nullable, so every existing
-- line (and every company not using Inventory) is completely unaffected.
ALTER TABLE invoice_lines ADD COLUMN item_id TEXT REFERENCES inventory_items(id);
ALTER TABLE bill_lines ADD COLUMN item_id TEXT REFERENCES inventory_items(id);

-- Low-stock behavior toggle already exists (allow_negative_stock, from Milestone 1);
-- inventory_enabled already exists too — both were added ahead of time as scaffolding
-- and are now wired up by this module.

-- Cost of Goods Sold (debited when an item sells) and Inventory Adjustments (the
-- variance account for manual stock adjustments) for every company that already
-- exists — folded into seedAccounts.js's defaults for every company created from now on.
INSERT INTO accounts (company_id, code, name, type, group_name)
SELECT id, '5090', 'Cost of Goods Sold', 'expense', 'Cost of Goods Sold' FROM companies
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = companies.id AND a.code = '5090');

INSERT INTO accounts (company_id, code, name, type, group_name)
SELECT id, '5095', 'Inventory Adjustments', 'expense', 'Inventory Adjustments' FROM companies
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = companies.id AND a.code = '5095');
