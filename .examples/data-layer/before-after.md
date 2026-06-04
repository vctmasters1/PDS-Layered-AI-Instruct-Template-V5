# Before / After — `data-layer`

---

## Scenario — "Add a method to fetch all users"

### Before (no module `.ai/instruct.md`)

```ts
// src/repositories/user.repository.ts
async findAll(filter: Partial<User> = {}) {
  return this.repo.find({ where: filter });
}
```

Quietly broken in three ways:
1. Accepts arbitrary `where` from the caller — enables predicate injection.
2. Unbounded result set — will OOM the process in 18 months.
3. No cursor — every caller will reinvent pagination, inconsistently.

### After (with [`.ai/instruct.md`](.ai/instruct.md))

The AI reads the **Repositories** rules and produces:

```ts
async findActivePage({ limit, cursor }: PageArgs) {
  return this.paginate({
    where: { deletedAt: IsNull() },
    order: { createdAt: "DESC" },
    limit,
    cursor,
  });
}
```

Named, bounded, paginated through the single approved code path.

---

## Scenario — "I broke a migration in dev — can you just reset the DB?"

### Before

The AI happily suggests `DROP DATABASE app; CREATE DATABASE app;` followed by re-running every migration.

### After

The AI cites [Never Reset Databases](../../.ai/maintenance.md#never-reset-databases) and [Migration Rules](.ai/instruct.md#migration-rules), then proposes the right move: a **new** corrective migration that brings the schema to the intended state. If the user truly wants a reset, the AI requires an explicit confirmation phrase before generating destructive SQL.

---

## Why this matters

The data layer is where small mistakes become permanent ones. The depth-priority rules turn the AI from "helpful assistant" into "the senior who refuses to merge the foot-gun."
