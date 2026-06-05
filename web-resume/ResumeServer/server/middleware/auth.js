import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.userId, username: payload.username, role: payload.role, resumeAccess: payload.resumeAccess ?? false };
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}

export function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  next();
}

// Blocks users who have not been explicitly granted resume access by an admin.
// Admins always bypass this check.
export function requireResumeAccess(req, res, next) {
  if (req.user?.role === 'admin' || req.user?.resumeAccess) return next();
  return res.status(403).json({ success: false, error: 'Resume access has not been authorized for this account. Contact an administrator.' });
}
