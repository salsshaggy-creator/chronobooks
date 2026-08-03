const documentService = require('../services/document.service');
const { httpError } = require('../services/approval.service');

async function upload(req, res) {
  const { companyId, sub: userId } = req.user;
  if (!req.file) throw httpError(400, 'No file was uploaded.');
  const result = await documentService.saveUploadedFile(companyId, userId, {
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    file: req.file,
  });
  res.status(201).json(result);
}

async function list(req, res) {
  const { companyId } = req.user;
  const { entityType, entityId } = req.query;
  const documents = await documentService.listDocuments(companyId, entityType, entityId);
  res.json({ documents });
}

async function download(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const doc = await documentService.getDocument(companyId, id);
  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name.replace(/"/g, '')}"`);
  res.sendFile(documentService.filePathFor(doc), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'The file is missing from storage.' });
  });
}

async function remove(req, res) {
  const { companyId, sub: userId, role } = req.user;
  const { id } = req.params;
  const result = await documentService.deleteDocument(companyId, userId, role, id);
  res.json(result);
}

module.exports = { upload, list, download, remove };
