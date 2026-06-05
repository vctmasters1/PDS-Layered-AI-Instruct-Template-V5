import express from 'express';
import { db } from '../database/database.js';
import { fileStore } from '../services/file-store.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function toSlug(str) {
  return str.trim()
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

function extractSourceUrl(content) {
  const m = content.match(/\*\*Source:\*\*\s*(https?:\/\/[^\s\n]+)/);
  return m ? m[1] : null;
}

// GET /api/listings
router.get('/', asyncHandler(async (req, res) => {
  const r = await db.query(
    `SELECT l.id, l.slug, l.title, l.folder_name, l.folder_index, l.created_at, l.source_url, l.fit_score,
            COALESCE(ARRAY_AGG(a.filename) FILTER (WHERE a.filename IS NOT NULL), '{}') AS artifacts
     FROM listings l
     LEFT JOIN artifacts a ON a.listing_id = l.id
     WHERE l.user_id = $1
     GROUP BY l.id
     ORDER BY l.folder_index`,
    [req.user.id]
  );
  res.json({ success: true, data: r.rows });
}));

// GET /api/listings/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const listing = await db.getListingByUserAndId(req.user.id, req.params.id);
  if (!listing) return res.status(404).json({ success: false, error: 'Listing not found.' });
  res.json({ success: true, data: listing });
}));

// POST /api/listings — create a new listing
router.post('/', asyncHandler(async (req, res) => {
  const { title, content } = req.body ?? {};
  if (!title || !content) {
    return res.status(400).json({ success: false, error: 'title and content are required.' });
  }

  const baseSlug = toSlug(title);
  if (!baseSlug) return res.status(400).json({ success: false, error: 'Could not generate a valid slug from title.' });

  const sourceUrl = extractSourceUrl(content);

  // Find a unique slug by appending -2, -3, etc. if needed
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const exists = await db.query(
      'SELECT id FROM listings WHERE user_id = $1 AND slug = $2',
      [req.user.id, slug]
    );
    if (!exists.rows.length) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  // Compute per-user folder index
  const countRes = await db.query(
    'SELECT COUNT(*) FROM listings WHERE user_id = $1',
    [req.user.id]
  );
  const folderIndex = Number(countRes.rows[0].count) + 1;
  const folderName = `${String(folderIndex).padStart(4, '0')}-${slug}`;

  const r = await db.query(
    `INSERT INTO listings (user_id, slug, title, content, folder_name, folder_index, source_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, slug, title, folder_name, folder_index, created_at, source_url`,
    [req.user.id, slug, title.slice(0, 255), content, folderName, folderIndex, sourceUrl]
  );
  const listing = r.rows[0];
  listing.artifacts = [];

  // Create the application folder and write the listing file
  const userRoot = fileStore.userRoot(req.user.username);
  await fileStore.writeFile(userRoot, `Listings/${slug}.md`, content);
  await fileStore.writeFile(userRoot, `Current/${folderName}/.keep`, '');

  res.status(201).json({ success: true, data: listing });
}));

// DELETE /api/listings/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const listing = await db.getListingByUserAndId(req.user.id, req.params.id);
  if (!listing) return res.status(404).json({ success: false, error: 'Listing not found.' });

  const userRoot = fileStore.userRoot(req.user.username);

  // Delete filesystem artifacts
  await fileStore.deleteDir(userRoot, `Current/${listing.folder_name}`).catch(() => {});

  await db.query('DELETE FROM listings WHERE id = $1', [listing.id]);

  res.json({ success: true, data: null });
}));

export default router;
