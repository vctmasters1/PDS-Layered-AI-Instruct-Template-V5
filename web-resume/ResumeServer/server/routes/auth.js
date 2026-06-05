import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../database/database.js';
import { fileStore } from '../services/file-store.js';
import { env } from '../config/env.js';
import { authLimiter } from '../middleware/rate-limit.js';

const router = express.Router();
router.use(authLimiter);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function toSlug(str) {
  return str.trim()
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

function issueToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role, resumeAccess: user.resume_access ?? false },
    env.jwtSecret,
    { expiresIn: '30d' }
  );
}

router.post('/register', asyncHandler(async (_req, res) => {
  // Public self-registration is disabled. Accounts are created by admins only.
  return res.status(403).json({ success: false, error: 'Self-registration is disabled. Contact an administrator to create an account.' });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'username and password are required.' });
  }

  const user = await db.getUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid credentials.' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ success: false, error: 'Invalid credentials.' });
  }

  const token = issueToken(user);
  res.json({
    success: true,
    data: { token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, resumeAccess: user.resume_access ?? false } },
  });
}));

export default router;
