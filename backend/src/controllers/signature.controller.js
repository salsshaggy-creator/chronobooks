const crypto = require('crypto');
const db = require('../config/db');

/** Every user gets one saved signature they draw once and reuse — for signing documents and for approving requests in the Approval Workflow. */
async function getMySignature(req, res) {
  const result = await db.query(`SELECT signature_data, updated_at FROM signatures WHERE user_id = $1`, [req.user.sub]);
  const row = result.rows[0];
  res.json({ signatureData: row ? row.signature_data : null, updatedAt: row ? row.updated_at : null });
}

/** Save/replace the caller's own signature (a base64 PNG data URL from the SignaturePad draw pad). */
async function saveMySignature(req, res) {
  const { companyId, sub: userId } = req.user;
  const { signatureData } = req.body;
  if (!signatureData || typeof signatureData !== 'string' || !signatureData.startsWith('data:image/')) {
    return res.status(400).json({ error: 'A signature image (data URL) is required.' });
  }

  const existing = await db.query(`SELECT id FROM signatures WHERE user_id = $1`, [userId]);
  if (existing.rows[0]) {
    await db.query(`UPDATE signatures SET signature_data = $1, updated_at = $2 WHERE user_id = $3`, [signatureData, new Date().toISOString(), userId]);
  } else {
    await db.query(
      `INSERT INTO signatures (id, company_id, user_id, signature_data) VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), companyId, userId, signatureData]
    );
  }
  res.json({ ok: true });
}

async function deleteMySignature(req, res) {
  await db.query(`DELETE FROM signatures WHERE user_id = $1`, [req.user.sub]);
  res.json({ ok: true });
}

module.exports = { getMySignature, saveMySignature, deleteMySignature };
