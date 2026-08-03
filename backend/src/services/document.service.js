const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');
const { httpError } = require('./approval.service');

// Every entity a receipt/document can be pinned to. Kept as a plain whitelist rather
// than checking the parent table directly, since the parent tables don't share a
// primary key type (see the migration's comment on entity_type/entity_id).
const ENTITY_TYPES = ['invoice', 'bill', 'expense', 'quote', 'fixed_asset'];

// Files themselves live on disk, one folder per company, outside of git and outside of
// anything express.static would ever expose directly -- every read goes through the
// authenticated download endpoint below instead.
const UPLOADS_ROOT = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// Manage-or-own roles for deleting someone else's attachment -- matches the other
// "*_MANAGE_ROLES" role sets used across the app (Budgeting, Recurring, Reconciliation).
const DOCUMENT_MANAGE_ROLES = ['administrator', 'accountant', 'finance_manager', 'super_administrator'];

function companyDir(companyId) {
  return path.join(UPLOADS_ROOT, companyId);
}

function assertValidEntityType(entityType) {
  if (!ENTITY_TYPES.includes(entityType)) {
    throw httpError(400, `entityType must be one of: ${ENTITY_TYPES.join(', ')}.`);
  }
}

async function saveUploadedFile(companyId, userId, { entityType, entityId, file }) {
  assertValidEntityType(entityType);
  if (!entityId) throw httpError(400, 'entityId is required.');
  if (!file) throw httpError(400, 'No file was uploaded.');
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw httpError(400, `File type "${file.mimetype}" isn't supported. Upload a PDF, image, text, Word, or Excel file.`);
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw httpError(400, 'File is larger than the 10MB limit.');
  }

  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO documents (id, company_id, entity_type, entity_id, file_name, storage_key, mime_type, size_bytes, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, companyId, entityType, String(entityId), file.originalname, file.filename, file.mimetype, file.size, userId]
  );

  return { id, fileName: file.originalname, sizeBytes: file.size, mimeType: file.mimetype };
}

async function listDocuments(companyId, entityType, entityId) {
  assertValidEntityType(entityType);
  const res = await db.query(
    `SELECT d.id, d.file_name, d.mime_type, d.size_bytes, d.created_at, d.uploaded_by, u.full_name as uploaded_by_name
     FROM documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.company_id = $1 AND d.entity_type = $2 AND d.entity_id = $3
     ORDER BY d.created_at DESC`,
    [companyId, entityType, String(entityId)]
  );
  return res.rows;
}

async function getDocument(companyId, documentId) {
  const res = await db.query(`SELECT * FROM documents WHERE id = $1 AND company_id = $2`, [documentId, companyId]);
  const doc = res.rows[0];
  if (!doc) throw httpError(404, 'Document not found.');
  return doc;
}

function filePathFor(doc) {
  return path.join(companyDir(doc.company_id), doc.storage_key);
}

async function deleteDocument(companyId, userId, userRole, documentId) {
  const doc = await getDocument(companyId, documentId);
  const isOwner = doc.uploaded_by === userId;
  const canManage = DOCUMENT_MANAGE_ROLES.includes(userRole);
  if (!isOwner && !canManage) {
    throw httpError(403, "You don't have permission to delete this attachment.");
  }

  await db.query(`DELETE FROM documents WHERE id = $1`, [documentId]);

  const filePath = filePathFor(doc);
  fs.promises.unlink(filePath).catch(() => {
    // The DB row is the source of truth; a missing/already-gone file on disk shouldn't
    // block the delete from succeeding.
  });

  return { ok: true };
}

module.exports = {
  ENTITY_TYPES,
  MAX_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  UPLOADS_ROOT,
  companyDir,
  assertValidEntityType,
  saveUploadedFile,
  listDocuments,
  getDocument,
  filePathFor,
  deleteDocument,
};
