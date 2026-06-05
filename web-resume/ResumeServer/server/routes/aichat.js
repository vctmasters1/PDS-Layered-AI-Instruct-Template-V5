import express from 'express';
import { fileStore } from '../services/file-store.js';
import { authMiddleware } from '../middleware/auth.js';
import { llm } from '../services/llm-client.js';

const router = express.Router();
router.use(authMiddleware);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const SYSTEM_PROMPT_HEADER = `You are a helpful, knowledgeable assistant. The user has provided their full professional profile below — this may include a resume summary, work history, skills, education, source documents, and skills analysis notes.

Use this context when relevant to personalize your answers. The user can ask about anything: career advice, writing help, technical questions, interview prep, or general conversation. Be direct, honest, and conversational.

--- USER PROFILE ---
{profile}
--- END PROFILE ---`;

async function buildProfile(userRoot) {
  const sections = [];

  // Parts files
  try {
    const parts = await fileStore.listDir(userRoot, 'Parts');
    for (const f of parts) {
      const content = await fileStore.readFile(userRoot, `Parts/${f}`);
      sections.push(`### Parts/${f}\n${content.trim()}`);
    }
  } catch { /* directory missing */ }

  // Source documents
  try {
    const sources = await fileStore.listDir(userRoot, 'Sources');
    for (const f of sources) {
      if (f.endsWith('.md') || f.endsWith('.txt')) {
        const content = await fileStore.readFile(userRoot, `Sources/${f}`);
        sections.push(`### Sources/${f}\n${content.trim()}`);
      }
    }
  } catch { /* directory missing */ }

  // Skills analysis if present
  try {
    const analysis = await fileStore.readFile(userRoot, 'Sources/skills-analysis.md');
    if (analysis.trim()) sections.push(`### Skills Analysis\n${analysis.trim()}`);
  } catch { /* not generated yet */ }

  return sections.length > 0
    ? sections.join('\n\n')
    : '(No profile files uploaded yet.)';
}

// POST /api/aichat/message
// Body: { messages: [{ role: 'user'|'assistant', content: string }, ...] }
router.post('/message', asyncHandler(async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'messages array is required.' });
  }

  // Validate each message shape
  const MAX_CONTENT = 32_000; // ~8k tokens — prevent runaway inputs
  for (const m of messages) {
    if (!m || typeof m.content !== 'string' || !['user', 'assistant'].includes(m.role)) {
      return res.status(400).json({ success: false, error: 'Each message must have role (user|assistant) and content (string).' });
    }
    if (m.content.length > MAX_CONTENT) {
      return res.status(400).json({ success: false, error: `Message content exceeds maximum length of ${MAX_CONTENT} characters.` });
    }
  }

  // Cap history to last 40 turns to avoid token overflow
  const trimmed = messages.slice(-40);

  const userRoot = fileStore.userRoot(req.user.username);
  const profile = await buildProfile(userRoot);
  const systemPrompt = SYSTEM_PROMPT_HEADER.replace('{profile}', profile);

  const content = await llm.chat(systemPrompt, trimmed);
  res.json({ success: true, data: { content } });
}));

export default router;
