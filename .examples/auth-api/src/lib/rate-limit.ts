// Stub rate-limit middleware. In production, replace with a real implementation
// (e.g. express-rate-limit backed by Redis) per auth-api/.ai/instruct.md → Security Rule 5.
//
// Every auth route that accepts credentials or triggers email sends MUST use this middleware.
// Adding a new auth route without authRateLimit is a Security Rule 5 violation.

import type { RequestHandler } from 'express';

export const authRateLimit: RequestHandler = (_req, _res, next) => {
  // Real impl: express-rate-limit with a shared Redis store, 10 req / 15 min window per IP.
  next();
};
