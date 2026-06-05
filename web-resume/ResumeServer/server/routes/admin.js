import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { db } from '../database/database.js';
import { invalidateLlmCache } from '../services/llm-settings.js';

const router = express.Router();
router.use(authMiddleware);
router.use(adminMiddleware);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/admin/users — list all users
router.get('/users', asyncHandler(async (_req, res) => {
  const r = await db.query('SELECT id, username, full_name, role, resume_access, created_at FROM users ORDER BY created_at');
  res.json({ success: true, data: r.rows });
}));

// POST /api/admin/users — create a new user (admin only)
router.post('/users', asyncHandler(async (req, res) => {
  const { username, password, fullName, role } = req.body ?? {};
  if (!username || !password || !fullName) {
    return res.status(400).json({ success: false, error: 'username, password, and fullName are required.' });
  }
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
    return res.status(400).json({ success: false, error: 'Username must be 3-30 alphanumeric characters.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
  }
  const existing = await db.getUserByUsername(username);
  if (existing) {
    return res.status(409).json({ success: false, error: 'Username already taken.' });
  }
  const { default: bcrypt } = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 12);
  const assignedRole = ['admin', 'user'].includes(role) ? role : 'user';
  const r = await db.query(
    `INSERT INTO users (username, full_name, password_hash, role)
     VALUES ($1, $2, $3, $4) RETURNING id, username, full_name, role`,
    [username.toLowerCase(), fullName, passwordHash, assignedRole]
  );
  const { fileStore } = await import('../services/file-store.js');
  await fileStore.ensureUserDirs(r.rows[0].username);
  res.status(201).json({ success: true, data: r.rows[0] });
}));

// POST /api/admin/users/:id/role — change a user's role
router.post('/users/:id/role', asyncHandler(async (req, res) => {
  const { role } = req.body ?? {};
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Role must be "user" or "admin".' });
  }
  const r = await db.query('UPDATE users SET role = $2 WHERE id = $1', [req.params.id, role]);
  if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'User not found.' });
  res.json({ success: true, data: null });
}));

// POST /api/admin/users/:id/resume-access — grant or revoke resume access
router.post('/users/:id/resume-access', asyncHandler(async (req, res) => {
  const { access } = req.body ?? {};
  if (typeof access !== 'boolean') {
    return res.status(400).json({ success: false, error: '"access" must be a boolean.' });
  }
  const r = await db.query('UPDATE users SET resume_access = $2 WHERE id = $1', [req.params.id, access]);
  if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'User not found.' });
  res.json({ success: true, data: null });
}));

// GET /api/admin/settings/llm — read current LLM settings (api_key masked)
router.get('/settings/llm', asyncHandler(async (_req, res) => {
  const r = await db.query(
    "SELECT key, value FROM settings WHERE key IN ('llm_api_url', 'llm_api_key', 'llm_model')"
  );
  const s = Object.fromEntries(r.rows.map((row) => [row.key, row.value]));
  res.json({
    success: true,
    data: {
      apiUrl: s.llm_api_url ?? '',
      apiKey: s.llm_api_key ? '***' : '',  // never return the real key to the client
      model:  s.llm_model   ?? '',
    },
  });
}));

// POST /api/admin/settings/llm — save LLM settings
router.post('/settings/llm', asyncHandler(async (req, res) => {
  const { apiUrl, apiKey, model } = req.body ?? {};
  if (apiUrl  !== undefined) await db.setSetting('llm_api_url', String(apiUrl));
  if (model   !== undefined) await db.setSetting('llm_model',   String(model));
  // Only overwrite api_key if a real value is provided — '***' is the masked sentinel, ignore it
  if (apiKey && apiKey !== '***') await db.setSetting('llm_api_key', String(apiKey));
  invalidateLlmCache();
  res.json({ success: true, data: null });
}));

export default router;