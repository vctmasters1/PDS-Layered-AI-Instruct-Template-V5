import { timingSafeEqual } from 'node:crypto';

// Per .ai/instruct.md → Security Rule 7: timing-safe comparisons for any
// secret/identifier comparison. Never use `===` for those.
export function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
