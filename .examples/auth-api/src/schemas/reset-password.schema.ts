import { z } from 'zod';

export const requestResetSchema = z.object({
  email: z.string().email().max(254),
});

export type RequestResetInput = z.infer<typeof requestResetSchema>;
