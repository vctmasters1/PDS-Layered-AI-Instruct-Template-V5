// Thin HTTP adapter. Pattern enforced by auth-api/.ai/instruct.md:
//   validate input (Zod) → call ONE service method → format envelope → send.
// No business logic. No DB calls.

import { Router } from 'express';
import { loginSchema } from '../schemas/login.schema.js';
import { authService } from '../services/auth.service.js';
import { ok, fail } from '../lib/response.js';
import { InvalidCredentialsError } from '../lib/errors.js';
import { authRateLimit } from '../lib/rate-limit.js';

export const loginRoute = Router();

loginRoute.post('/login', authRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(fail('VALIDATION', parsed.error.issues));
  }

  try {
    const tokens = await authService.login(parsed.data.email, parsed.data.password);
    return res.json(ok(tokens));
  } catch (err) {
    // Domain → HTTP translation happens HERE, never in the service.
    if (err instanceof InvalidCredentialsError) {
      return res.status(401).json(fail('INVALID_CREDENTIALS'));
    }
    throw err;
  }
});
