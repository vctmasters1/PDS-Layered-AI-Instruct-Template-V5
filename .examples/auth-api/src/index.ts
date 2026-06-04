// Server bootstrap. The ONLY file allowed to read process.env directly and
// the only file that may console.log. See .ai/instruct.md → Module-Specific Rules.

import express from 'express';
import { loginRoute } from './routes/login.route.js';
import { logger } from './lib/logger.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail-fast per Security Rule 2.
  console.error('FATAL: JWT_SECRET is not set');
  process.exit(1);
}

export function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/v1/auth', loginRoute);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => {
    logger.info({ port }, 'auth-api listening');
  });
}
