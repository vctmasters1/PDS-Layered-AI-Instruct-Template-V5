import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
});

export type SignupInput = z.infer<typeof signupSchema>;
