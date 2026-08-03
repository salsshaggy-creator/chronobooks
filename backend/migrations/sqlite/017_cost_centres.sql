-- Cost Centres: tag a Sales invoice, Purchases bill, or Expense with a department/
-- project/branch cost centre (already exist as a Parameters list, migration 008) so
-- income and expenses can be broken down by centre. cost_centres.id is INTEGER PRIMARY
-- KEY AUTOINCREMENT (migration 008) so this FK column must be INTEGER, not TEXT/UUID --
-- see the budgets.account_id lesson from migration 015. Nullable so every existing row
-- and every company not using this module (the default) is completely unaffected.

ALTER TABLE invoices ADD COLUMN cost_centre_id INTEGER REFERENCES cost_centres(id);
ALTER TABLE bills ADD COLUMN cost_centre_id INTEGER REFERENCES cost_centres(id);
ALTER TABLE expenses ADD COLUMN cost_centre_id INTEGER REFERENCES cost_centres(id);
