// Business logic. Calls repositories, throws DOMAIN errors (not HTTP).
// Per auth-api/.ai/instruct.md → Module-Specific Rules → Layering.

import { userRepository } from '../repositories/user.repository.js';
import { hashPassword, verifyPassword } from '../lib/hash.js';
import { issueAccessToken, issueRefreshToken } from './token.service.js';
import { InvalidCredentialsError, EmailTakenError } from '../lib/errors.js';
import { timingSafeEqualStr } from '../lib/timing.js';

export const authService = {
  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    // Hash a dummy even on miss so attackers can't time-distinguish unknown emails.
    // The constant below is a real argon2id hash; verifyPassword will always return false for it.
    const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$ZGPpNPAT16ZUX2YgE5XgNw$2+Aj3q9kzbmKBCS+6FE7rQJulEC6zyiWSnX+NGqUUnk';
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const verified = await verifyPassword(hash, password);

    if (!user || !verified) {
      throw new InvalidCredentialsError();
    }

    // Defence-in-depth: Security Rule 7 — timing-safe email match.
    if (!timingSafeEqualStr(user.email, email)) {
      throw new InvalidCredentialsError();
    }

    return {
      access: issueAccessToken(user.id),
      refresh: await issueRefreshToken(user.id),
    };
  },

  async signup(email: string, password: string) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new EmailTakenError(email);
    }

    const passwordHash = await hashPassword(password);
    const user = await userRepository.create({ email, passwordHash });

    return {
      access: issueAccessToken(user.id),
      refresh: await issueRefreshToken(user.id),
    };
  },

  async requestPasswordReset(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      // Return silently — caller always responds 200 to prevent email enumeration.
      return;
    }
    // Real impl: generate a signed reset token, persist it in password_resets table with
    // a 1-hour TTL, then dispatch via SendGrid. Never log or return the raw token.
    void user;
  },
};
