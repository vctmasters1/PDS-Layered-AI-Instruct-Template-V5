// Token issuance. The ONLY place that calls jwt.sign / jwt.verify directly.
// Per .ai/instruct.md → Security Rule 3.

import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';

const SECRET = process.env.JWT_SECRET!; // index.ts guarantees this is set.
const ACCESS_TTL = '15m';

export function issueAccessToken(userId: string) {
  return jwt.sign({ sub: userId }, SECRET, { algorithm: 'HS256', expiresIn: ACCESS_TTL });
}

export async function issueRefreshToken(_userId: string) {
  // Real impl: store rotating token in Redis with 30d TTL; revoke prior on use.
  return randomBytes(32).toString('base64url');
}

export function verifyAccessToken(token: string): { sub: string } {
  // Verifies signature AND exp/nbf — never call jwt.verify elsewhere.
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] }) as { sub: string };
}
