-- Quotes & Sales Orders: a pre-invoice proposal for a customer -- draft it, mark it sent,
-- record whether the customer accepted or declined, then convert an accepted (or sent)
-- one into a real invoice. A quote never touches the ledger or inventory on its own --
-- it's purely a proposal document. Only "Convert to Invoice" posts anything, and it does
-- so by calling the exact same buildInvoice logic a direct Sales invoice uses, so nothing
-- about how an invoice gets created or posted needs to be duplicated here. Unlike most
-- other modules added this segment, Quotes has no company-level enable toggle -- it's
-- core Sales functionality, always available, the same as Sales/Purchases/Banking.

CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  quote_number TEXT NOT NULL,
  quote_date TEXT NOT NULL,
  expiry_date TEXT,
  income_category TEXT NOT NULL DEFAULT 'Sales',
  tax_rate_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(18,2) NOT NULL,
  tax NUMERIC(18,2) NOT NULL,
  total NUMERIC(18,2) NOT NULL,
  -- draft -> sent -> accepted/declined ; only a sent or accepted quote can convert.
  -- Locked (no further status changes or edits) once converted.
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  currency TEXT,                    -- display-only on the quote itself; the actual
                                     -- exchange rate is resolved fresh at conversion time,
                                     -- the same way a brand-new invoice would resolve it,
                                     -- rather than locking in a rate that might be weeks old.
  cost_centre_id INTEGER REFERENCES cost_centres(id),
  converted_invoice_id UUID REFERENCES invoices(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotes_company ON quotes(company_id);

CREATE TABLE quote_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC(18,2) NOT NULL,
  line_total NUMERIC(18,2) NOT NULL,
  item_id UUID REFERENCES inventory_items(id)  -- optional: same item picker Sales uses;
                                                -- purely a reference until conversion, when
                                                -- it flows into the invoice line and issues
                                                -- stock exactly like a direct invoice would.
);
