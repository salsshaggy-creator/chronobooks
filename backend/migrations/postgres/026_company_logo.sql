-- Uploaded company logo (file lives on disk, alongside Documents attachments) --
-- separate from the pre-existing logo_url free-text column so a real upload is never
-- silently overwritten by whatever URL string happened to be sitting in that field.
ALTER TABLE companies ADD COLUMN logo_storage_key TEXT;
ALTER TABLE companies ADD COLUMN logo_mime_type TEXT;
