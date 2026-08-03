const db = require('../config/db');
const { encryptApiKey, decryptApiKey, maskApiKey } = require('../utils/aiKeyCrypto');
const { KNOWLEDGE_BASE } = require('../ai/knowledgeBase');

const SUPPORTED_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'];
const DEFAULT_MODEL = 'gpt-4o-mini';

// The AI Assistant is free for every company — it only ever answers questions about
// how ChronoBooks itself works (see knowledgeBase.js), never a company's real
// financial data, so there's no per-company cost to gate. It's powered by a single
// platform-wide OpenAI key (set once, by whoever operates this ChronoBooks
// installation, as PLATFORM_OPENAI_API_KEY) so support just works out of the box for
// every user without anyone having to bring their own key. A company can still add
// its own key in Settings → AI Assistant if it wants dedicated usage/rate limits
// separate from the shared platform allowance — that's optional, not required.
function platformApiKey() {
  return process.env.PLATFORM_OPENAI_API_KEY || process.env.OPENAI_API_KEY || null;
}

/** Resolves which key a request should actually use: the company's own if set, otherwise the shared platform key. */
function resolveApiKey(company) {
  if (company.ai_api_key_encrypted) {
    try {
      return { apiKey: decryptApiKey(company.ai_api_key_encrypted), source: 'company' };
    } catch {
      return { apiKey: null, source: 'company', unreadable: true };
    }
  }
  const platformKey = platformApiKey();
  if (platformKey) return { apiKey: platformKey, source: 'platform' };
  return { apiKey: null, source: 'none' };
}

/** Current AI Assistant configuration. Available to every authenticated user (not admin-gated) since the assistant itself is free for everyone — only changing the key is an admin action. */
async function getAiSettings(req, res) {
  const { companyId } = req.user;
  const result = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = result.rows[0];
  if (!company) return res.status(404).json({ error: 'Company not found.' });

  let maskedKey = null;
  if (company.ai_api_key_encrypted) {
    try {
      maskedKey = maskApiKey(decryptApiKey(company.ai_api_key_encrypted));
    } catch {
      maskedKey = 'sk-•••• (unreadable — please re-enter)';
    }
  }

  const { source } = resolveApiKey(company);
  res.json({
    provider: company.ai_provider || 'openai',
    model: company.ai_model || DEFAULT_MODEL,
    hasKey: !!company.ai_api_key_encrypted,
    maskedKey,
    freeForEveryone: true,
    usingPlatformKey: source === 'platform',
    available: source !== 'none',
    supportedModels: SUPPORTED_MODELS,
  });
}

/** Admin-only: save/replace the company's own API key and/or model. Blank apiKey means "keep the existing key, just update the model". Entirely optional now that the platform key makes the assistant free by default. */
async function updateAiSettings(req, res) {
  const { companyId } = req.user;
  const { apiKey, model } = req.body;

  const existing = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = existing.rows[0];
  if (!company) return res.status(404).json({ error: 'Company not found.' });

  if (model && !SUPPORTED_MODELS.includes(model)) {
    return res.status(400).json({ error: `Unsupported model. Choose from ${SUPPORTED_MODELS.join(', ')}.` });
  }

  const encrypted = apiKey ? encryptApiKey(apiKey) : company.ai_api_key_encrypted;
  await db.query(
    `UPDATE companies SET ai_provider = $1, ai_api_key_encrypted = $2, ai_model = $3 WHERE id = $4`,
    ['openai', encrypted, model || company.ai_model || DEFAULT_MODEL, companyId]
  );
  res.json({ ok: true });
}

/** Admin-only: remove the company's own key — falls back to the shared platform key, so the assistant keeps working either way. */
async function clearAiSettings(req, res) {
  const { companyId } = req.user;
  await db.query(`UPDATE companies SET ai_api_key_encrypted = NULL WHERE id = $1`, [companyId]);
  res.json({ ok: true });
}

/**
 * Ask the assistant a question. Open to every authenticated user (any role) — free
 * for everyone, no license or plan check. Grounded entirely in the ChronoBooks
 * knowledge base; never touches this company's real financial data.
 */
async function ask(req, res) {
  const { companyId } = req.user;
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages (a non-empty array of {role, content}) is required.' });
  }

  const result = await db.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = result.rows[0];
  if (!company) return res.status(404).json({ error: 'Company not found.' });

  const resolved = resolveApiKey(company);
  if (resolved.unreadable) {
    return res.status(500).json({ error: 'The stored API key could not be read. Please re-enter it in Settings → AI Assistant, or remove it to use the free shared assistant instead.', code: 'ai_key_unreadable' });
  }
  if (!resolved.apiKey) {
    return res.status(503).json({
      error: "The AI Assistant isn't fully set up on this server yet — ask whoever manages this ChronoBooks installation to set a platform OpenAI key.",
      code: 'ai_not_configured',
    });
  }

  const trimmedHistory = messages.slice(-12); // keep the request small; recent context is enough for a help chat
  const payload = {
    model: company.ai_model || DEFAULT_MODEL,
    messages: [{ role: 'system', content: KNOWLEDGE_BASE }, ...trimmedHistory],
    temperature: 0.3,
    max_tokens: 700,
  };

  let openaiRes;
  try {
    openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resolved.apiKey}` },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return res.status(502).json({ error: `Could not reach OpenAI: ${err.message}`, code: 'ai_network_error' });
  }

  if (!openaiRes.ok) {
    const errBody = await openaiRes.json().catch(() => ({}));
    const message = errBody?.error?.message || `OpenAI request failed (${openaiRes.status}).`;
    const status = openaiRes.status === 401 ? 401 : 502;
    const friendly = status === 401
      ? (resolved.source === 'company'
        ? 'That OpenAI API key was rejected. Please check it in Settings → AI Assistant, or remove it to fall back to the free shared assistant.'
        : "The shared platform OpenAI key was rejected — ask whoever manages this ChronoBooks installation to check it.")
      : message;
    return res.status(status).json({ error: friendly, code: 'ai_provider_error' });
  }

  const data = await openaiRes.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) return res.status(502).json({ error: 'OpenAI returned an empty response.', code: 'ai_empty_response' });

  res.json({ reply });
}

module.exports = { getAiSettings, updateAiSettings, clearAiSettings, ask, resolveApiKey, SUPPORTED_MODELS, DEFAULT_MODEL };
