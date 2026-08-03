-- AI Assistant ("avatar") — bring-your-own-key model already promised on the License
-- page (ai_assistant_allowance from migration 007). The key itself is stored encrypted
-- (see src/utils/aiKeyCrypto.js), never returned to the frontend once saved.

ALTER TABLE companies ADD COLUMN ai_provider TEXT;
ALTER TABLE companies ADD COLUMN ai_api_key_encrypted TEXT;
ALTER TABLE companies ADD COLUMN ai_model TEXT;
