import express from 'express';
import { db } from '../database/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { enqueueJob, getJobStatus, getPipelineStatus, runAll } from '../services/job-queue.js';

const router = express.Router();
router.use(authMiddleware);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_STEPS = ['analyze', 'draft-000', 'score-000', 'draft-001', 'score-001', 'build'];

// GET /api/workflow/:listingId/status
router.get('/:listingId/status', asyncHandler(async (req, res) => {
  const listing = await db.getListingByUserAndId(req.user.id, req.params.listingId);
  if (!listing) return res.status(404).json({ success: false, error: 'Listing not found.' });

  const status = await getPipelineStatus(listing.id);
  res.json({ success: true, data: status });
}));

// GET /api/workflow/:listingId/jobs/:jobId
router.get('/:listingId/jobs/:jobId', asyncHandler(async (req, res) => {
  const job = await getJobStatus(req.params.jobId);
  if (!job || job.listing_id !== Number(req.params.listingId)) {
    return res.status(404).json({ success: false, error: 'Job not found.' });
  }
  // Verify ownership via listing
  const listing = await db.getListingByUserAndId(req.user.id, job.listing_id);
  if (!listing) return res.status(403).json({ success: false, error: 'Access denied.' });

  res.json({ success: true, data: { jobId: job.id, step: job.step, status: job.status, error: job.error } });
}));

// POST /api/workflow/:listingId/run-all — run the full pipeline from analyze to build
router.post('/:listingId/run-all', asyncHandler(async (req, res) => {
  const listing = await db.getListingByUserAndId(req.user.id, req.params.listingId);
  if (!listing) return res.status(404).json({ success: false, error: 'Listing not found.' });

  const jobId = await runAll(req.user.id, listing.id);
  res.status(202).json({ success: true, data: { jobId, status: 'pending', queued: true } });
}));

// POST /api/workflow/:listingId/:step — trigger a workflow step
router.post('/:listingId/:step', asyncHandler(async (req, res) => {
  const { step } = req.params;
  if (!VALID_STEPS.includes(step)) {
    return res.status(400).json({ success: false, error: `Invalid step. Valid steps: ${VALID_STEPS.join(', ')}` });
  }

  const listing = await db.getListingByUserAndId(req.user.id, req.params.listingId);
  if (!listing) return res.status(404).json({ success: false, error: 'Listing not found.' });

  // Don't queue a second pending/running job for the same step
  const existing = await db.getLatestJobForStep(listing.id, step);
  if (existing && (existing.status === 'pending' || existing.status === 'running')) {
    return res.json({ success: true, data: { jobId: existing.id, status: existing.status, queued: false } });
  }

  const jobId = await enqueueJob(req.user.id, listing.id, step);
  res.status(202).json({ success: true, data: { jobId, status: 'pending', queued: true } });
}));

export default router;
