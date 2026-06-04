// Thin HTTP adapter. Pattern enforced by auth-api/.ai/instruct.md:
//   validate input (Zod) → call ONE service method → format envelope → send.
// No business logic. No DB calls.
//
// Security Rule 5: authRateLimit is required on this route — it triggers email sends
// and can otherwise be abused for email enumeration or flooding.

import { Router } from 'express';
import { requestResetSchema } from '../schemas/reset-password.schema.js';
import { authService } from '../services/auth.service.js';
import { ok, fail } from '../lib/response.js';
import { authRateLimit } from '../lib/rate-limit.js';

export const resetPasswordRoute = Router();

resetPasswordRoute.post('/reset-password', authRateLimit, async (req, res) => {
  const parsed = requestResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(fail('VALIDATION', parsed.error.issues));
  }

  // Always respond 200 regardless of whether the email exists — prevents enumeration.
  await authService.requestPasswordReset(parsed.data.email);
  return res.json(ok({ message: 'If that address is registered, a reset email has been sent.' }));
});
