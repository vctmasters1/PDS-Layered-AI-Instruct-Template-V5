import express from 'express';
import { fileStore } from '../services/file-store.js';
import { authMiddleware } from '../middleware/auth.js';
import { uploadRich } from '../middleware/upload.js';
import { enqueueUserJob, getJobStatus } from '../services/job-queue.js';
import { PARTS_MANIFEST } from '../services/prompts/parts-extract.js';
import { extractText, storageFilename } from '../services/text-extractor.js';

const router = express.Router();
router.use(authMiddleware);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/sources — list source files
router.get('/', asyncHandler(async (req, res) => {
  const userRoot = fileStore.userRoot(req.user.username);
  const files = await fileStore.listDir(userRoot, 'Sources');
  res.json({ success: true, data: files });
}));

// GET /api/sources/parts-manifest — return the parts manifest so the UI knows what parts to expect
router.get('/parts-manifest', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: PARTS_MANIFEST.map(({ filename, name, description }) => ({ filename, name, description })) });
}));

// POST /api/sources/build-parts — enqueue a build-parts job for the current user
router.post('/build-parts', asyncHandler(async (req, res) => {
  const userRoot = fileStore.userRoot(req.user.username);
  const sources = await fileStore.listDir(userRoot, 'Sources');
  if (sources.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No source documents found. Upload at least one source file first.',
    });
  }
  const jobId = await enqueueUserJob(req.user.id, 'build-parts');
  res.status(202).json({ success: true, data: { jobId } });
}));

// GET /api/sources/build-parts/status/:jobId — poll a build-parts job
router.get('/build-parts/status/:jobId', asyncHandler(async (req, res) => {
  const job = await getJobStatus(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found.' });
  if (job.user_id !== req.user.id) return res.status(403).json({ success: false, error: 'Forbidden.' });
  res.json({ success: true, data: { status: job.status, error: job.error } });
}));

// ─── Sources/other — skills analysis drop zone ────────────────────────────────

// GET /api/sources/other — list files in Sources/other
router.get('/other', asyncHandler(async (req, res) => {
  const userRoot = fileStore.userRoot(req.user.username);
  const files = await fileStore.listDir(userRoot, 'Sources/other');
  res.json({ success: true, data: files });
}));

// POST /api/sources/other — upload a file to Sources/other
router.post('/other', uploadRich.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded.' });
  }
  const rawName = fileStore.sanitizeFilename(req.file.originalname);
  const filename = storageFilename(rawName);
  const userRoot = fileStore.userRoot(req.user.username);
  const text = await extractText(req.file.buffer, req.file.originalname);
  await fileStore.writeFile(userRoot, `Sources/other/${filename}`, text);
  res.status(201).json({ success: true, data: { filename } });
}));

// DELETE /api/sources/other/:filename — remove a file from Sources/other
router.delete('/other/:filename', asyncHandler(async (req, res) => {
  const filename = fileStore.sanitizeFilename(req.params.filename);
  const userRoot = fileStore.userRoot(req.user.username);
  if (!await fileStore.exists(userRoot, `Sources/other/${filename}`)) {
    return res.status(404).json({ success: false, error: 'File not found.' });
  }
  await fileStore.deleteFile(userRoot, `Sources/other/${filename}`);
  res.json({ success: true, data: null });
}));

// POST /api/sources/analyze-skills — enqueue an analyze-skills job
router.post('/analyze-skills', asyncHandler(async (req, res) => {
  const userRoot = fileStore.userRoot(req.user.username);
  const files = await fileStore.listDir(userRoot, 'Sources/other');
  if (files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files found in the analysis drop zone. Upload at least one file first.',
    });
  }
  const jobId = await enqueueUserJob(req.user.id, 'analyze-skills');
  res.status(202).json({ success: true, data: { jobId } });
}));

// GET /api/sources/analyze-skills/status/:jobId — poll an analyze-skills job
router.get('/analyze-skills/status/:jobId', asyncHandler(async (req, res) => {
  const job = await getJobStatus(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found.' });
  if (job.user_id !== req.user.id) return res.status(403).json({ success: false, error: 'Forbidden.' });
  res.json({ success: true, data: { status: job.status, error: job.error } });
}));

// GET /api/sources/skills-analysis — read the skills analysis result
router.get('/skills-analysis', asyncHandler(async (req, res) => {
  const userRoot = fileStore.userRoot(req.user.username);
  if (!await fileStore.exists(userRoot, 'Sources/skills-analysis.md')) {
    return res.json({ success: true, data: { content: null } });
  }
  const content = await fileStore.readFile(userRoot, 'Sources/skills-analysis.md');
  res.json({ success: true, data: { content } });
}));

// PUT /api/sources/skills-analysis — save edited skills analysis
router.put('/skills-analysis', asyncHandler(async (req, res) => {
  const { content } = req.body ?? {};
  if (typeof content !== 'string') {
    return res.status(400).json({ success: false, error: 'content (string) is required.' });
  }
  const userRoot = fileStore.userRoot(req.user.username);
  await fileStore.writeFile(userRoot, 'Sources/skills-analysis.md', content);
  res.json({ success: true, data: null });
}));

// ─── Sources/template — resume style template drop zone ───────────────────────

// GET /api/sources/template — list template files
router.get('/template', asyncHandler(async (req, res) => {
  const userRoot = fileStore.userRoot(req.user.username);
  const files = await fileStore.listDir(userRoot, 'Sources/template');
  res.json({ success: true, data: files });
}));

// POST /api/sources/template — upload a template file (docx stored as binary; others as text)
router.post('/template', uploadRich.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });
  const filename = fileStore.sanitizeFilename(req.file.originalname);
  const userRoot = fileStore.userRoot(req.user.username);
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'docx' || ext === 'pdf') {
    // Store binary directly — docx used as pandoc reference-doc; pdf for AI extraction later
    await fileStore.writeFile(userRoot, `Sources/template/${filename}`, req.file.buffer);
  } else {
    const text = await extractText(req.file.buffer, req.file.originalname);
    await fileStore.writeFile(userRoot, `Sources/template/${filename}`, text);
  }
  res.status(201).json({ success: true, data: { filename } });
}));

// DELETE /api/sources/template/:filename
router.delete('/template/:filename', asyncHandler(async (req, res) => {
  const filename = fileStore.sanitizeFilename(req.params.filename);
  const userRoot = fileStore.userRoot(req.user.username);
  if (!await fileStore.exists(userRoot, `Sources/template/${filename}`)) {
    return res.status(404).json({ success: false, error: 'File not found.' });
  }
  await fileStore.deleteFile(userRoot, `Sources/template/${filename}`);
  res.json({ success: true, data: null });
}));

// POST /api/sources/template/analyze — enqueue analyze-template job
router.post('/template/analyze', asyncHandler(async (req, res) => {
  const userRoot = fileStore.userRoot(req.user.username);
  const files = await fileStore.listDir(userRoot, 'Sources/template');
  if (files.length === 0) {
    return res.status(400).json({ success: false, error: 'No template files uploaded yet.' });
  }
  const jobId = await enqueueUserJob(req.user.id, 'analyze-template');
  res.status(202).json({ success: true, data: { jobId } });
}));

// GET /api/sources/template/analyze/status/:jobId
router.get('/template/analyze/status/:jobId', asyncHandler(async (req, res) => {
  const job = await getJobStatus(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found.' });
  if (job.user_id !== req.user.id) return res.status(403).json({ success: false, error: 'Forbidden.' });
  res.json({ success: true, data: { status: job.status, error: job.error } });
}));

// GET /api/sources/template/notes — read inferred style guide
router.get('/template/notes', asyncHandler(async (req, res) => {
  const userRoot = fileStore.userRoot(req.user.username);
  if (!await fileStore.exists(userRoot, 'Sources/template-notes.md')) {
    return res.json({ success: true, data: { content: null } });
  }
  const content = await fileStore.readFile(userRoot, 'Sources/template-notes.md');
  res.json({ success: true, data: { content } });
}));

// PUT /api/sources/template/notes — save edited style guide
router.put('/template/notes', asyncHandler(async (req, res) => {
  const { content } = req.body ?? {};
  if (typeof content !== 'string') return res.status(400).json({ success: false, error: 'content required.' });
  const userRoot = fileStore.userRoot(req.user.username);
  await fileStore.writeFile(userRoot, 'Sources/template-notes.md', content);
  res.json({ success: true, data: null });
}));

// GET /api/sources/:filename — read a source file's content
router.get('/:filename', asyncHandler(async (req, res) => {
  const filename = fileStore.sanitizeFilename(req.params.filename);
  const userRoot = fileStore.userRoot(req.user.username);
  if (!await fileStore.exists(userRoot, `Sources/${filename}`)) {
    return res.status(404).json({ success: false, error: 'File not found.' });
  }
  const content = await fileStore.readFile(userRoot, `Sources/${filename}`);
  res.json({ success: true, data: { content } });
}));

// PUT /api/sources/:filename — save edited content back to a source file
router.put('/:filename', asyncHandler(async (req, res) => {
  const filename = fileStore.sanitizeFilename(req.params.filename);
  const { content } = req.body ?? {};
  if (typeof content !== 'string') {
    return res.status(400).json({ success: false, error: 'content (string) is required.' });
  }
  const userRoot = fileStore.userRoot(req.user.username);
  await fileStore.writeFile(userRoot, `Sources/${filename}`, content);
  res.json({ success: true, data: null });
}));

// POST /api/sources — upload a source file
router.post('/', uploadRich.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded.' });
  }
  const rawName = fileStore.sanitizeFilename(req.file.originalname);
  const filename = storageFilename(rawName);
  const userRoot = fileStore.userRoot(req.user.username);
  const text = await extractText(req.file.buffer, req.file.originalname);
  await fileStore.writeFile(userRoot, `Sources/${filename}`, text);
  res.status(201).json({ success: true, data: { filename } });
}));

// DELETE /api/sources/:filename — remove a source file
router.delete('/:filename', asyncHandler(async (req, res) => {
  const filename = fileStore.sanitizeFilename(req.params.filename);
  const userRoot = fileStore.userRoot(req.user.username);
  if (!await fileStore.exists(userRoot, `Sources/${filename}`)) {
    return res.status(404).json({ success: false, error: 'File not found.' });
  }
  await fileStore.deleteFile(userRoot, `Sources/${filename}`);
  res.json({ success: true, data: null });
}));

export default router;
