# DB-Central — AI-INSTRUCT

**Authority**: DEEP — Authoritative for all work inside `DB-Central/`
**Last Updated**: 2026-05-21

---

## Contents

| § | What's here |
|---|-------------|
| [What DB-Central Is](#what-db-central-is) | Purpose and non-purpose |
| [What DB-Central Is Not](#what-db-central-is-not) | Hard boundaries |
| [Directory Structure](#directory-structure) | Canonical layout |
| [Entity Ownership Model](#entity-ownership-model) | Who owns what, which services consume what |
| [User Entity & Service Permissions](#user-entity--service-permissions) | The single authoritative User + access flags |
| [How Consuming Services Use DB-Central](#how-consuming-services-use-db-central) | tsconfig path alias, import pattern |
| [Migration Strategy](#migration-strategy) | synchronize: false, one runner, run order |
| [WEB-Resume Integration](#web-resume-integration) | Current status, Phase 2 plan |
| [Docker Compose Ownership](#docker-compose-ownership) | Dev PostgreSQL lives here |
| [Service Integration Status](#service-integration-status) | Per-service migration state |
| [Rules for Adding Entities or Columns](#rules-for-adding-entities-or-columns) | Change discipline |

---

## What DB-Central Is

DB-Central is the **single authoritative TypeScript source** for all TypeORM entities, migrations, and shared DB types used by every backend service in this monorepo.

It is a **shared source directory** — not a service, not a package, not a running process. It has no `main()`, no HTTP server, no runtime process of its own. It is `.ts` files that TypeScript compiles **inline** as part of each consuming service's build. Nothing here is ever deployed independently.

**Why it exists:** The monorepo has a single Railway PostgreSQL instance shared by WEB-Marketplace, WEB-HMI, WEB-FwServer, and (Phase 2) WEB-Resume. Without a single entity source, schema drift and sync collisions are inevitable — and have already occurred.

---

## What DB-Central Is Not

| It is NOT | Why it matters |
|-----------|----------------|
| An npm package | No publish step, no version tags, no npm registry |
| A workspace (npm/yarn/pnpm) | No `workspaces` config in root `package.json` |
| A service | Never has a process running; never has a Railway deployment |
| A place for business logic | Route handlers, middleware, validation — all stay in their service |
| A place for service-specific config | `DataSource` config, `.env` parsing — stays in each service |
| The owner of a service's DataSource | Each service creates its own TypeORM `DataSource` pointing at DB-Central entities |

---

## Directory Structure

```
DB-Central/
├── AI-INSTRUCT.md              ← This file
├── docker-compose.yml          ← Dev PostgreSQL (pds_marketplace on :5432)
├── tsconfig.json               ← Strict TypeScript config — used as reference by services
│
└── src/
    ├── index.ts                ← Barrel: re-exports all entities and enums
    │
    ├── entities/
    │   ├── index.ts
    │   │
    │   │── user.ts             ← PLATFORM-LEVEL — single authoritative User
    │   │
    │   │   ── Marketplace entities ──
    │   ├── designer.ts
    │   ├── producer.ts
    │   ├── product.ts
    │   ├── service.ts
    │   ├── order.ts
    │   ├── order-item.ts
    │   ├── bid.ts
    │   ├── bulletin-card.ts
    │   ├── dispute.ts
    │   ├── favorite.ts
    │   ├── invoice.ts
    │   ├── message.ts
    │   ├── message-fee.ts
    │   ├── messaging-fee-waiver.ts
    │   ├── notification.ts
    │   ├── notification-preference.ts
    │   ├── payment-milestone.ts
    │   ├── payout.ts
    │   ├── portfolio-image.ts
    │   ├── report.ts
    │   ├── review.ts
    │   ├── site-settings.ts
    │   ├── waitlist-entry.ts
    │   ├── audit-log.ts
    │   ├── email-verification-token.ts
    │   ├── password-reset-token.ts
    │   ├── search.ts
    │   │
    │   │   ── HMI / Device entities ──
    │   ├── device.ts
    │   ├── device-config.ts
    │   ├── telemetry-log.ts
    │   │
    │   │   ── FwServer entities ──
    │   └── firmware.ts
    │
    └── migrations/
        ├── index.ts            ← Ordered migration list (import order = run order)
        └── [timestamp]-[description].ts
```

---

## Entity Ownership Model

"Ownership" means: **this service is the authority on what columns exist and is responsible for writing migrations for that entity.** Non-owning services may read any entity — they simply import it from DB-Central.

| Entity | Logical Owner | Also Read By |
|--------|--------------|--------------|
| `User` | DB-Central (platform) | All services |
| `Designer`, `Producer` | WEB-Marketplace | — |
| `Product`, `Service`, `Order`, `OrderItem` | WEB-Marketplace | — |
| `Bid`, `BulletinCard`, `Dispute`, `Favorite` | WEB-Marketplace | — |
| `Invoice`, `Message`, `Notification` | WEB-Marketplace | — |
| `PaymentMilestone`, `Payout` | WEB-Marketplace | — |
| `SiteSettings`, `AuditLog` | WEB-Marketplace | — |
| `EmailVerificationToken`, `PasswordResetToken` | WEB-Marketplace | — |
| `WaitlistEntry`, `Report`, `Review`, `Search` | WEB-Marketplace | — |
| `Device`, `DeviceConfig`, `TelemetryLog` | WEB-HMI | — |
| `Firmware` | WEB-FwServer | WEB-HMI (read-only) |

**Platform-level entities** (owned by DB-Central itself, not by any one service) are entities that cross all service boundaries and have no single service home. Currently only `User`. These are the responsibility of whoever works on the platform at a cross-service level.

---

## User Entity & Service Permissions

`User` is the one entity every service touches. It has a dual role:

1. **Identity** — auth credentials, contact info, role, soft-delete audit trail
2. **Service access control** — boolean flags that gate which products/features a user can access

### Current permission flags on User

The existing `activeDesigner / activeProducer / activeMaterials / activeAuthor / activeGizmo` flags are the established pattern — they control marketplace tab visibility. Service access flags extend that pattern:

```typescript
// ── Service access flags ──────────────────────────────────────────────────
// These mirror WEB-Resume's `resume_access` column (which predates DB-Central).
// Admin sets these flags. Each service's auth middleware checks its own flag.

@Column({ default: false })
resumeAccess: boolean;       // Can access WEB-Resume AI tools

// Future examples (add when the feature exists):
// @Column({ default: false }) hmiAccess: boolean;
```

### Rules

- **Never** gate access via `role` alone for service-level products (role defines marketplace role; flags define product subscriptions)
- **Admin sets flags** — the `/api/admin/users` endpoint in each service should expose these flags
- **Adding a new flag** requires: (1) adding the column to `user.ts` here, (2) writing a migration, (3) adding a setter to the admin route of the relevant service
- `isStaff` / `staffRole` continue to control internal PDS employee access across all services

---

## How Consuming Services Use DB-Central

### Step 1 — tsconfig path alias

In each consuming service's `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@db-central/*": ["../../DB-Central/src/*"]
    }
  }
}
```

Adjust the relative path depth to match the service's location in the repo.

### Step 2 — Import entities

```typescript
import { User, UserRole }   from '@db-central/entities/user.js';
import { Device }           from '@db-central/entities/device.js';
import { Firmware }         from '@db-central/entities/firmware.js';
```

### Step 3 — DataSource stays in the service

Each service creates its **own** TypeORM `DataSource`. It points to the DB-Central entities, but the connection config (host, credentials, pool settings) lives in the service:

```typescript
// WEB-HMI/api/src/database.ts
import { User }         from '@db-central/entities/user.js';
import { Device }       from '@db-central/entities/device.js';
import { DeviceConfig } from '@db-central/entities/device-config.js';
import { TelemetryLog } from '@db-central/entities/telemetry-log.js';
import { Firmware }     from '@db-central/entities/firmware.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,                    // NEVER true once DB-Central is live
  entities: [User, Device, DeviceConfig, TelemetryLog, Firmware],
  migrations: [],                        // Services do not run migrations themselves
});
```

**Key rule:** A service only registers the entities it actually uses in its `DataSource`. It does not register all DB-Central entities — only its subset.

### Step 4 — Do not run migrations from the service

All migrations are run by the **DB-Central migration runner** (see below). Services set `migrations: []` and `migrationsRun: false`.

---

## Migration Strategy

### The Problem with `synchronize: true`

TypeORM `synchronize: true` runs `ALTER TABLE` statements on startup based on the current entity definitions. When two services start up against the same schema with different entity definitions (or ordering), destructive conflicts occur. **This is what caused the null email collision.**

### The Rule

> `synchronize: false` in every service, always, once DB-Central is live.

### How Migrations Work

1. **Schema changes start here** — add/change a column in `DB-Central/src/entities/`
2. **Write a migration** — create a timestamped file in `DB-Central/src/migrations/`
3. **Run migrations once** — use the DB-Central migration runner script (not any service's startup)
4. **Services inherit the schema** — they start up, find the schema already matches their entities, and proceed

### Migration runner

```
DB-Central/
└── run-migrations.ts    ← Standalone script: npx ts-node run-migrations.ts
```

This script creates a temporary `DataSource` with **all** entities and runs pending migrations. It is the only thing that mutates the schema.

### Migration file naming

`{timestamp}-{description}.ts` — e.g. `20260521001-add-resume-access-to-user.ts`

Use TypeORM's `QueryRunner` API. Never use raw `synchronize`. Never drop columns without a matching migration to preserve or backfill data.

---

## WEB-Resume Integration

WEB-Resume (`ResumeServer/`) is currently **out-of-band** — it uses:
- Raw SQL (pg Pool), not TypeORM
- A separate PostgreSQL database
- SERIAL integer PK on `users` (not UUID)
- Its own `resume_access` boolean column

### Phase 1 (current): Loose coupling

The `resumeAccess` flag on DB-Central's `User` entity allows Marketplace admin to grant/revoke Resume access without touching the Resume service. Resume itself continues to use its own DB and its own auth.

This means WEB-Resume does **not** yet use DB-Central. It is documented here so the gap is explicit.

### Phase 2 (future): Full integration

1. Migrate Resume's PostgreSQL to the shared `pds` database
2. Migrate `users.id` from `SERIAL` to `UUID` (requires data migration + foreign key updates on `listings`, `workflow_jobs`, `artifacts`)
3. Replace Resume's `users` table with a read-view of DB-Central's `User`, adding Resume-specific columns (`listings`, `workflow_jobs`, `artifacts`) as child tables keyed on UUID
4. Replace Resume's raw SQL auth with JWT token validation against DB-Central's shared JWT secret

**Do not begin Phase 2 until Marketplace and HMI are fully migrated to DB-Central.**

---

## Docker Compose Ownership

The development PostgreSQL container was previously in `WEB-Marketplace/api/docker-compose.yml`. It belongs in DB-Central because it is a platform-level infrastructure resource, not a Marketplace resource.

```
DB-Central/docker-compose.yml
```

All dev-start commands reference this file:
```bash
docker compose -f k:/PDS_AutomationSuite/DB-Central/docker-compose.yml up -d
```

The `mp-dev-start-server` prompt in `.github/prompts/` must be updated to reference this path.

---

## Service Integration Status

| Service | DB-Central entities? | synchronize | Notes |
|---------|---------------------|-------------|-------|
| WEB-Marketplace/api | ✅ Complete | `false` | `User`, `Designer`, `Producer`, `Product`, `Service` are re-export shims (`export … from "@db-central/entities/…"`); remaining 23 entities are local copies keyed to the same schema |
| WEB-HMI/api | ✅ Complete | `false` | All 5 entity files are re-export shims (`export … from "@db-central/entities/…"`); `synchronize: false` |
| WEB-FwServer/api | ⬜ Not yet | unknown | Has local stub `User` + local `Firmware` definition |
| WEB-Resume/ResumeServer | ⬜ Phase 2 | N/A (raw SQL) | Separate DB, loose coupling only |

Migration order: Marketplace → FwServer → Resume (Phase 2). HMI is done.

### WEB-HMI/api — legacy migration files

Two migration files remain in `WEB-HMI/api/src/migrations/` as historical records — they have already been applied and are tracked in the `migrations` table. They will not re-run. Future device-schema changes must go through DB-Central migrations.

---

## Rules for Adding Entities or Columns

1. **New entity** → create the `.ts` file in `DB-Central/src/entities/`, add it to `src/entities/index.ts` and `src/index.ts`, write a migration, update this table in [Entity Ownership Model](#entity-ownership-model)

> **→ [`.ai/database.md`](.ai/database.md)** — Database architecture standard with universal column requirements, naming conventions, RLS policies, and migration discipline rules.


2. **New column on an existing entity** → edit the entity file here first, then write the migration. Do not edit the entity in any consuming service.

3. **Column removal** → write a migration with a data-preservation plan (backfill or archive) before dropping. Document the reason in the migration file.

4. **Never** edit entities in a consuming service's `src/entities/` directory once that service is migrated to DB-Central. Those local entity files become dead code and should be deleted.

5. **Breaking changes** (enum rename, PK type change) require a multi-step migration with a backfill pass. Coordinate with all consuming services before executing.

6. **AI-INSTRUCT.md maintenance**: Any entity addition, column addition, or permission flag addition requires updating the relevant section(s) of this file in the same operation.
