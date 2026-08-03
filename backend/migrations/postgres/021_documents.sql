-- Documents & File Attachments: lets a user attach a receipt, PDF, or photo directly to
-- an invoice, bill, expense, quote, or fixed asset -- proof that lives next to the
-- transaction it belongs to instead of in a separate email or drawer. entity_type/
-- entity_id is a deliberately loose (unenforced by FK) pointer, the same polymorphic
-- pattern used elsewhere when one table needs to hang off several different parent
-- tables that don't share a primary key type. The actual file bytes live on disk under
-- backend/uploads/<company_id>/<storage_key> -- only the metadata and pointer live here.

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,     -- 'invoice' | 'bill' | 'expense' | 'quote' | 'fixed_asset'
  entity_id TEXT NOT NULL,       -- id of the row in that entity's own table; no FK, since
                                  -- the parent table varies by entity_type
  file_name TEXT NOT NULL,       -- original filename, shown to the user
  storage_key TEXT NOT NULL,     -- randomized filename actually used on disk
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_entity ON documents(company_id, entity_type, entity_id);
