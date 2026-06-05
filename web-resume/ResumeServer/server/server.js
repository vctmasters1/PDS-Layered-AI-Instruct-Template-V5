import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { validateEnv, env } from './config/env.js';
import { initDatabase } from './database/init-database.js';
import { startWorker } from './services/job-queue.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { authMiddleware, requireResumeAccess } from './middleware/auth.js';

import authRouter      from './routes/auth.js';
import listingsRouter  from './routes/listings.js';
import partsRouter     from './routes/parts.js';
import workflowRouter  from './routes/workflow.js';
import filesRouter     from './routes/files.js';
import extensionRouter from './routes/extension.js';
import adminRouter     from './routes/admin.js';
import sourcesRouter   from './routes/sources.js';
import insightRouter   from './routes/insight.js';
import aichatRouter    from './routes/aichat.js';

validateEnv();

const app = express();

// ─── Trust proxy (needed for rate-limiter behind Nginx/Docker) ────────────────
app.set('trust proxy', 1);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = env.isDev
  ? ['http://localhost:5173', `http://localhost:${env.port}`]
  : [
      `http://localhost:${env.port}`,
      // Caddy terminates TLS — browser origin arrives as https on whatever external port Caddy exposes
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
    ];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, server-to-server)
    // Allow chrome-extension:// origins (Chrome extension service workers)
    if (!origin || origin.startsWith('chrome-extension://') || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api/auth',      authRouter);
app.use('/api/listings',  authMiddleware, requireResumeAccess, listingsRouter);
app.use('/api/parts',     authMiddleware, requireResumeAccess, partsRouter);
app.use('/api/workflow',  authMiddleware, requireResumeAccess, workflowRouter);
app.use('/api/files',     authMiddleware, requireResumeAccess, filesRouter);
app.use('/api/extension', extensionRouter);
app.use('/api/admin',     adminRouter);
app.use('/api/sources',   authMiddleware, requireResumeAccess, sourcesRouter);
app.use('/api/insight',   authMiddleware, requireResumeAccess, insightRouter);
app.use('/api/aichat',    authMiddleware, requireResumeAccess, aichatRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ─── Serve React SPA in production ───────────────────────────────────────────
if (!env.isDev) {
  const clientDist = path.resolve(import.meta.dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err.message);
  const status = err.status ?? 500;
  // Never expose internal details to clients
  res.status(status).json({ success: false, error: status < 500 ? err.message : 'Internal server error.' });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  await initDatabase();
  startWorker();

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`[server] Resume-Suite listening on port ${env.port} (${env.nodeEnv})`);
    console.log(`[server] LLM: ${env.llmApiUrl} — model: ${env.llmModel}`);
  });
}

start().catch((err) => {
  console.error('[server] Startup failed:', err.message);
  process.exit(1);
});
