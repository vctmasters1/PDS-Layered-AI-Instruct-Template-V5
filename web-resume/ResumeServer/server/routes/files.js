import express from 'express';
import { createReadStream } from 'fs';
import path from 'path';
import { db } from '../database/database.js';
import { fileStore } from '../services/file-store.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const CONTENT_TYPES = {
  '.md':   'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf':  'application/pdf',
};

// GET /api/files/:listingId/:filename
router.get('/:listingId/:filename', asyncHandler(async (req, res) => {
  const listing = await db.getListingByUserAndId(req.user.id, req.params.listingId);
  if (!listing) return res.status(404).json({ success: false, error: 'Listing not found.' });

  const filename = fileStore.sanitizeFilename(req.params.filename);
  const userRoot = fileStore.userRoot(req.user.username);
  const relPath = `Current/${listing.folder_name}/${filename}`;

  const exists = await fileStore.exists(userRoot, relPath);
  if (!exists) return res.status(404).json({ success: false, error: 'File not found.' });

  const ext = path.extname(filename).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  const fullPath = fileStore.fullPath(userRoot, relPath);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  createReadStream(fullPath).pipe(res);
}));

export default router;
