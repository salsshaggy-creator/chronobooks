-- Quotes & Sales Orders: a pre-invoice proposal for a customer -- draft it, mark it sent,
-- record whether the customer accepted or declined, then convert an accepted (or sent)
-- one into a real invoice. A quote never touches the ledger or inventory on its own --
-- it's purely a proposal document. Only "Convert to Invoice" posts anything, and it does
-- so by calling the exact same buildInvoice logic a direct Sales invoice uses, so nothing
-- about how an invoice gets created or posted needs to be duplicated here. Unlike most
-- other modules added this segment, Quotes has no company-level enable toggle -- it's
-- core Sales functionality, always available, the same as Sales/Purchases/Banking.

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  quote_number TEXT NOT NULL,
  quote_date TEXT NOT NULL,
  expiry_date TEXT,
  income_category TEXT NOT NULL DEFAULT 'Sales',
  tax_rate_percent NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL,
  tax NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  -- draft -> sent -> accepted/declined ; only a sent or accepted quote can convert.
  -- Locked (no further status changes or edits) once converted.
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  currency TEXT,                    -- display-only on the quote itself; the actual
                                     -- exchange rate is resolved fresh at conversion time,
                                     -- the same way a brand-new invoice would resolve it,
                                     -- rather than locking in a rate that might be weeks old.
  cost_centre_id INTEGER REFERENCES cost_centres(id),
  converted_invoice_id TEXT REFERENCES invoices(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_quotes_company ON quotes(company_id);

CREATE TABLE quote_lines (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL,
  item_id TEXT REFERENCES inventory_items(id)  -- optional: same item picker Sales uses;
                                                -- purely a reference until conversion, when
                                                -- it flows into the invoice line and issues
                                                -- stock exactly like a direct invoice would.
);
