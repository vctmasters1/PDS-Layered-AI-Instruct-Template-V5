// Shared structured logger. Per .ai/instruct.md → Logging:
//   - import this, never use console.* outside src/index.ts bootstrap
//   - JSON output; redact known sensitive fields automatically
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['password', '*.password', 'token', '*.token', 'authorization'],
    censor: '[REDACTED]',
  },
});
