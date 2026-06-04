# Before / After — `auth-api`

Concrete examples of how AI behavior changes once [`.ai/instruct.md`](.ai/instruct.md) is in place inside this module.

---

## Scenario 1 — "Add a route that returns the current user"

### Before (no module `.ai/instruct.md`)

The AI sees a generic Express project and writes the obvious thing:

```ts
// src/routes/me.route.ts
import { Router } from "express";
import { getRepository } from "typeorm";
import { User } from "../entities/User";

export const meRouter = Router();
meRouter.get("/me", async (req, res) => {
  const userId = req.user!.id;
  const user = await getRepository(User).findOneBy({ id: userId });
  res.json(user);
});
```

Three rule violations the AI didn't know about:
1. Route calls the DB directly (rule: routes → services → repositories).
2. Returns a raw entity (rule: `{ data, error, meta }` envelope).
3. Leaks the password hash field back to the client.

### After (with [`.ai/instruct.md`](.ai/instruct.md))

The AI reads the layering and security rules and produces:

```ts
// src/routes/me.route.ts
import { Router } from "express";
import { authService } from "../services/auth.service";
import { ok } from "../lib/response";

export const meRouter = Router();
meRouter.get("/v1/auth/me", async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.user!.id);
    res.json(ok(profile));
  } catch (err) { next(err); }
});

// src/services/auth.service.ts (excerpt)
async getProfile(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw new UserNotFoundError(userId);
  return { id: user.id, email: user.email, createdAt: user.createdAt }; // no hash
}
```

Layered correctly, versioned, envelope used, password hash never leaves the repository.

---

## Scenario 2 — "Speed this up; the bcrypt compare is slow"

### Before

A well-meaning AI suggests replacing `argon2id` with `bcrypt` at lower cost, or worse, a fast non-constant-time comparison.

### After

The AI sees rule **#1** in [Security Rules](.ai/instruct.md#security-rules) (`argon2id` only) and rule **#7** (timing-safe comparisons). It refuses the swap and instead suggests:

- Tuning `argon2id` parameters in `src/lib/hash.ts` (single source of truth).
- Pre-warming the worker pool.
- Profiling whether the bottleneck is actually the hash or the surrounding round trip.

The AI cites the rule so the human reviewer can override deliberately if needed.

---

## Why this matters

Without the module file, the AI would have produced *plausible* code that passed code review on aesthetics but quietly broke layering and leaked sensitive fields. The depth-priority `.ai/instruct.md` turns the AI into a contributor that already understands the project's invariants.
