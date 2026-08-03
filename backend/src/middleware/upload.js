const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { companyDir, MAX_SIZE_BYTES, ALLOWED_MIME_TYPES } = require('../services/document.service');

// Runs after requireAuth, so req.user.companyId is already available -- each company's
// files land in their own folder on disk, named by the random storage key rather than
// the original filename (avoids collisions and path-traversal tricks via a crafted name).
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = companyDir(req.user.companyId);
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).slice(0, 20);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(Object.assign(new Error(`File type "${file.mimetype}" isn't supported. Upload a PDF, image, text, Word, or Excel file.`), { status: 400 }));
    }
    cb(null, true);
  },
}).single('file');

module.exports = uploadMiddleware;
