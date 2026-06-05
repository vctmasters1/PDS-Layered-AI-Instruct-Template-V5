import express from 'express';
import { fileStore } from '../services/file-store.js';
import { authMiddleware } from '../middleware/auth.js';
import { llm } from '../services/llm-client.js';

const router = express.Router();
router.use(authMiddleware);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const SYSTEM_PROMPT = `You are an experienced career advisor. The user's professional profile is provided below — it may include a resume summary, skills, work history, education, and other career-related notes.

Use this context to give honest, specific, and actionable career guidance. You may address: where they stand in the current job market, role targets, strengths, skill gaps, how to position themselves, realistic salary ranges, or any career topic they raise.

Be direct and honest. Use structured formatting (headers, bullet points, tables) when it makes the advice clearer.

--- USER PROFILE ---
{profile}
--- END PROFILE ---`;

// POST /api/insight/query
router.post('/query', asyncHandler(async (req, res) => {
  const MAX_MESSAGE = 32_000; // ~8k tokens — prevent runaway inputs
  const { message } = req.body ?? {};
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'message is required.' });
  }
  if (message.length > MAX_MESSAGE) {
    return res.status(400).json({ success: false, error: `Message exceeds maximum length of ${MAX_MESSAGE} characters.` });
  }

  const userRoot = fileStore.userRoot(req.user.username);

  // Collect all Parts files for context
  let profileSections = [];
  try {
    const partFiles = await fileStore.listDir(userRoot, 'Parts');
    for (const filename of partFiles) {
      const content = await fileStore.readFile(userRoot, `Parts/${filename}`);
      profileSections.push(`### ${filename}\n${content.trim()}`);
    }
  } catch {
    // Parts directory may not exist yet — proceed with empty profile
  }

  const profile = profileSections.length > 0
    ? profileSections.join('\n\n')
    : '(No resume parts uploaded yet.)';

  const systemPrompt = SYSTEM_PROMPT.replace('{profile}', profile);
  const content = await llm.complete(systemPrompt, message.trim());

  res.json({ success: true, data: { content } });
}));

export default router;
