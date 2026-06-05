import express from 'express';
import { fileStore } from '../services/file-store.js';
import { authMiddleware } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();
router.use(authMiddleware);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/parts
router.get('/', asyncHandler(async (req, res) => {
  const userRoot = fileStore.userRoot(req.user.username);
  const files = await fileStore.listDir(userRoot, 'Parts');
  res.json({ success: true, data: files });
}));

// POST /api/parts — upload a Part file
router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded.' });
  }

  const filename = fileStore.sanitizeFilename(req.file.originalname);
  const userRoot = fileStore.userRoot(req.user.username);

  await fileStore.writeFile(userRoot, `Parts/${filename}`, req.file.buffer);

  res.status(201).json({ success: true, data: { filename } });
}));

// DELETE /api/parts/:filename
router.delete('/:filename', asyncHandler(async (req, res) => {
  const filename = fileStore.sanitizeFilename(req.params.filename);
  const userRoot = fileStore.userRoot(req.user.username);

  const exists = await fileStore.exists(userRoot, `Parts/${filename}`);
  if (!exists) return res.status(404).json({ success: false, error: 'File not found.' });

  await fileStore.deleteFile(userRoot, `Parts/${filename}`);
  res.json({ success: true, data: null });
}));

// GET /api/parts/:filename — read a part file's content
router.get('/:filename', asyncHandler(async (req, res) => {
  const filename = fileStore.sanitizeFilename(req.params.filename);
  const userRoot = fileStore.userRoot(req.user.username);
  if (!await fileStore.exists(userRoot, `Parts/${filename}`)) {
    return res.status(404).json({ success: false, error: 'File not found.' });
  }
  const content = await fileStore.readFile(userRoot, `Parts/${filename}`);
  res.json({ success: true, data: { content } });
}));

// PUT /api/parts/:filename — save edited content back to a part file
router.put('/:filename', asyncHandler(async (req, res) => {
  const filename = fileStore.sanitizeFilename(req.params.filename);
  const { content } = req.body ?? {};
  if (typeof content !== 'string') {
    return res.status(400).json({ success: false, error: 'content (string) is required.' });
  }
  const userRoot = fileStore.userRoot(req.user.username);
  await fileStore.writeFile(userRoot, `Parts/${filename}`, content);
  res.json({ success: true, data: null });
}));

export default router;
