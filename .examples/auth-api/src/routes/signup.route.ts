// Thin HTTP adapter. Pattern enforced by auth-api/.ai/instruct.md:
//   validate input (Zod) → call ONE service method → format envelope → send.
// No business logic. No DB calls.

import { Router } from 'express';
import { signupSchema } from '../schemas/signup.schema.js';
import { authService } from '../services/auth.service.js';
import { ok, fail } from '../lib/response.js';
import { EmailTakenError } from '../lib/errors.js';

export const signupRoute = Router();

signupRoute.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(fail('VALIDATION', parsed.error.issues));
  }

  try {
    const tokens = await authService.signup(parsed.data.email, parsed.data.password);
    return res.status(201).json(ok(tokens));
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return res.status(409).json(fail('EMAIL_TAKEN'));
    }
    throw err;
  }
});
