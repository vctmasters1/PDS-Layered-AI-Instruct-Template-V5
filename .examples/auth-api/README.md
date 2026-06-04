# auth-api — Example Module

A worked TypeScript + Express + JWT auth service. **Not runnable** — dependencies aren't installed and the repository is stubbed. The point is to show what a real module looks like under the layering, security, and logging rules defined in [.ai/instruct.md](.ai/instruct.md).

## Read these in this order

1. [.ai/instruct.md](.ai/instruct.md) — the rules
2. [src/routes/login.route.ts](src/routes/login.route.ts) — thin HTTP adapter
3. [src/services/auth.service.ts](src/services/auth.service.ts) — business logic, domain errors
4. [src/repositories/user.repository.ts](src/repositories/user.repository.ts) — only DB caller
5. [src/services/token.service.ts](src/services/token.service.ts) — only `jwt.sign` / `jwt.verify` caller
6. [src/lib/hash.ts](src/lib/hash.ts), [src/lib/errors.ts](src/lib/errors.ts), [src/lib/response.ts](src/lib/response.ts), [src/lib/logger.ts](src/lib/logger.ts), [src/lib/timing.ts](src/lib/timing.ts) — framework-agnostic helpers
7. [scripts/check-layering.mjs](scripts/check-layering.mjs) — the CI gate that enforces "routes never import repositories"
8. [test/unit/auth.service.test.ts](test/unit/auth.service.test.ts) — service test with mocked repo
9. [before-after.md](before-after.md) — concrete AI behavior differences with vs. without these rules

Every code comment cross-references the specific rule it enforces so you can trace the AI's behavior back to the instruction.
