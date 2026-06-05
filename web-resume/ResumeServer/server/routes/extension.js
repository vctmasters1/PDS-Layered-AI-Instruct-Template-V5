import express from 'express';
import path from 'path';
import { authMiddleware } from '../middleware/auth.js';
import { env } from '../config/env.js';

const router = express.Router();
router.use(authMiddleware);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EXTENSION_DIR = path.resolve(import.meta.dirname, '../../chrome-extension');

// GET /api/extension/download — download the Chrome extension as a ZIP
router.get('/download', asyncHandler(async (req, res) => {
  // Dynamic import to handle archiver's CJS nature in ESM context
  const { default: archiver } = await import('archiver');

  // Determine the HTTP URL the extension should use.
  // Extensions can't bypass self-signed TLS, so they must talk to Express
  // directly on port 38291 (plain HTTP). We derive the hostname from the
  // request so the ZIP works from any machine, not just localhost.
  // Override with EXTENSION_SERVER_URL env var if needed.
  const hostname = req.hostname;
  const extensionServerUrl = env.extensionServerUrl || `http://${hostname}:38291`;

  // Issue a fresh long-lived token for the extension so the user never has
  // to touch any settings — the ZIP is fully self-configuring.
  const jwt = (await import('jsonwebtoken')).default;
  const extensionToken = jwt.sign(
    { userId: req.user.id, username: req.user.username, role: req.user.role, resumeAccess: req.user.resumeAccess ?? false },
    env.jwtSecret,
    { expiresIn: '90d' }
  );

  const configJson = JSON.stringify({ serverUrl: extensionServerUrl, token: extensionToken }, null, 2);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="resume-suite-extension.zip"');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('[extension] Archive error:', err.message);
    if (!res.headersSent) res.status(500).end();
  });

  archive.pipe(res);
  archive.glob('**/*', {
    cwd: EXTENSION_DIR,
    ignore: ['AI-INSTRUCT.md', '.dev.md/**'],
  });
  // Inject server URL config — auto-configures the extension for this server
  archive.append(configJson, { name: 'config.json' });
  await archive.finalize();
}));

export default router;
