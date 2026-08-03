-- Company Setup completeness (identity, contact, tax configuration, accounting
-- preferences) plus fuller Banking Details fields. Additive only — every column has a
-- safe default so existing seeded/demo data keeps working unchanged.

ALTER TABLE companies ADD COLUMN trading_name TEXT;
ALTER TABLE companies ADD COLUMN registration_number TEXT;
ALTER TABLE companies ADD COLUMN nhil_registration TEXT;
ALTER TABLE companies ADD COLUMN ssnit_employer_number TEXT;
ALTER TABLE companies ADD COLUMN industry TEXT;
ALTER TABLE companies ADD COLUMN company_type TEXT;
ALTER TABLE companies ADD COLUMN fiscal_year_end_month INTEGER NOT NULL DEFAULT 12;
ALTER TABLE companies ADD COLUMN reporting_currency TEXT;
ALTER TABLE companies ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Africa/Accra';
ALTER TABLE companies ADD COLUMN language TEXT NOT NULL DEFAULT 'English';
ALTER TABLE companies ADD COLUMN mobile TEXT;
ALTER TABLE companies ADD COLUMN website TEXT;
ALTER TABLE companies ADD COLUMN postal_address TEXT;
ALTER TABLE companies ADD COLUMN digital_address TEXT;
ALTER TABLE companies ADD COLUMN region TEXT;
ALTER TABLE companies ADD COLUMN city TEXT;
ALTER TABLE companies ADD COLUMN gps_location TEXT;
ALTER TABLE companies ADD COLUMN stamp_url TEXT;
ALTER TABLE companies ADD COLUMN signature_url TEXT;

ALTER TABLE companies ADD COLUMN vat_registered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN vat_rate NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN nhil_rate NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN getfund_rate NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN covid_levy_rate NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN withholding_tax_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN corporate_tax_rate NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN default_tax_method TEXT NOT NULL DEFAULT 'exclusive';

ALTER TABLE companies ADD COLUMN accounting_method TEXT NOT NULL DEFAULT 'accrual';
ALTER TABLE companies ADD COLUMN decimal_places INTEGER NOT NULL DEFAULT 2;
ALTER TABLE companies ADD COLUMN allow_negative_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN multi_currency_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN cost_centres_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN budgeting_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN bank_reconciliation_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN inventory_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN fixed_assets_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN payroll_integration_enabled INTEGER NOT NULL DEFAULT 1;

ALTER TABLE bank_accounts ADD COLUMN branch TEXT;
ALTER TABLE bank_accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'GHS';
ALTER TABLE bank_accounts ADD COLUMN swift_code TEXT;
ALTER TABLE bank_accounts ADD COLUMN iban TEXT;
ALTER TABLE bank_accounts ADD COLUMN mobile_money_wallet TEXT;
ALTER TABLE bank_accounts ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
