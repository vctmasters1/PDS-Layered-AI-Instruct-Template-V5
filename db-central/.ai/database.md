# PDS Database Architecture Standard

**Scope**: DB-Central and all PDS modules using PostgreSQL/TypeORM  
**Authority**: DEEP — Authoritative for database architecture in PDS-Master-001  
**Last Updated**: 2026-05-27

---

## Contents

| Section | What's here |
|---------|-------------|
| [Universal Column Requirements](#universal-column-requirements) | Mandatory columns on every table |
| [Multi-Tenancy Rules](#multi-tenancy-rules) | account_id scoping and RLS policies |
| [Design Standards](#design-standards) | Naming conventions, data types, relationships |
| [Schema Management Rules](#schema-management-rules) | Migration discipline and documentation |

---

## Universal Column Requirements

Every table **must** contain the following columns:

```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
account_id     UUID NOT NULL                    -- Multi-tenancy anchor (see below)
created_at     TIMESTAMPTZ DEFAULT NOW()
updated_at     TIMESTAMPTZ DEFAULT NOW()

-- Optional but recommended:
created_by     UUID                             -- References users(id) or stores user UUID as string
updated_by     UUID                             -- References users(id) or stores user UUID as string
deleted_at     TIMESTAMPTZ                      -- Soft-delete (only add if needed for compliance)
```

### Column Details

| Column | Type | Required | Purpose |
|--------|------|----------|---------|
| `id` | `UUID` | Yes | Primary key - distributed systems friendly |
| `account_id` | `UUID` | Yes | Multi-tenancy anchor, indexed foreign key to accounts table |
| `created_at` | `TIMESTAMPTZ` | Yes | Creation timestamp with timezone support |
| `updated_at` | `TIMESTAMPTZ` | Yes | Last modification timestamp |
| `created_by` | `UUID` | Optional | Audit trail - who created the record |
| `updated_by` | `UUID` | Optional | Audit trail - who last modified the record |
| `deleted_at` | `TIMESTAMPTZ` | Conditional | Soft-delete - only add if retention/compliance requires |

---

## Multi-Tenancy Rules (Strict)

### Rule 1: account_id on Every Table

Every table **must** have an `account_id` column that scopes all data.

```typescript
@Column({ nullable: false })
accountId: string;

@ManyToOne(() => Account, { onDelete: "CASCADE" })
account: Account;
```

### Rule 2: Filter All Queries by account_id

All queries and API endpoints **must** filter by `account_id`. Never allow operations that could leak data across accounts.

```typescript
// ✅ CORRECT - Always filter by account_id
const properties = await repository.find({ 
  where: { accountId: req.accountId } 
});

// ❌ WRONG - No account_id filter (data leakage risk)
const properties = await repository.find();
```

### Rule 3: PostgreSQL Row Level Security (RLS)

Enable RLS policies on sensitive tables for defense-in-depth:

```sql
-- Example RLS policy for properties table
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_isolation ON properties
  FOR ALL
  USING (account_id = current_setting('app.current_account')::uuid);
```

**Note**: RLS is a backup layer. Application-level filtering (`account_id` in queries) is the primary enforcement.

---

## Design Standards

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Tables | snake_case | `properties`, `tenants`, `leases` |
| Columns | snake_case | `first_name`, `monthly_rent`, `created_at` |
| Foreign Keys | `{parent}_id` | `property_id`, `tenant_id`, `account_id` |
| Enums | PascalCase with static | `Lease.Status = { ACTIVE: 'active' }` |

### Data Types

| Use Case | Type | Notes |
|----------|------|-------|
| Primary keys | `UUID` | Use `gen_random_uuid()` default |
| Status fields | `VARCHAR` enum | Define as static class properties in entity |
| Text/long strings | `TEXT` | PostgreSQL optimized type |
| Flexible data | `JSONB` | For photos, metadata, variables (e.g., `photos: string[]`) |
| Monetary amounts | `DECIMAL(10, 2)` | Never use FLOAT for money |

### Indexing

Always add indexes on:

```sql
-- Required indexes on every table
CREATE INDEX idx_{table}_account_id ON {table}(account_id);

-- Add based on common query patterns:
CREATE INDEX idx_{table}_status ON {table}(status);
CREATE INDEX idx_{table}_created_at ON {table}(created_at);
CREATE INDEX idx_{table}_tenant_id ON {table}(tenant_id);
CREATE INDEX idx_{table}_property_id ON {table}(property_id);
```

### Enum Patterns

```typescript
export class Lease {
  static readonly Status = {
    DRAFT: "draft",
    ACTIVE: "active",
    EXPIRED: "expired",
  } as const;

  @Column({
    type: "enum",
    enum: Lease.Status,
    default: Lease.Status.DRAFT,
  })
  status: keyof typeof Lease.Status;
}
```

---

## Schema Management Rules

### 1. Database Documentation (.ai/database.md)

Each module must maintain a database schema documentation file:

```
module/
├── .ai/
│   └── database.md          ← Full schema documentation
└── src/...
```

**Document for each table:**
- Table name and purpose
- All columns with types
- Foreign keys and relationships
- Important indexes
- Sample data (if relevant)

**Example format:**

```markdown
## properties

Stores property/unit information owned by accounts.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| account_id | UUID | Multi-tenancy anchor |
| name | VARCHAR | Property name/number |
| address_street | VARCHAR | Street address |
| address_city | VARCHAR | City |
| status | VARCHAR | "active", "inactive" |

**Foreign Keys:**
- `account_id` → `accounts(id)` (CASCADE)

**Indexes:**
- `idx_properties_account_id`
```

### 2. Migration Discipline

Create migration files for **every** schema change:

```
db-central/src/migrations/
├── [timestamp]-[description].ts
└── index.ts
```

**Naming convention:** `{YYYYMMDDHHMMSS}-{kebab-description}.ts`

Example: `202605270931-create-property-entities.ts`

### 3. Never Drop Columns in Production

If a column must be removed:

1. **Deprecate first** - Add `deprecated` comment, stop using it in code
2. **Add migration to backfill/empty data**
3. **Document deprecation timeline**
4. **Eventually drop** only after all services have migrated

### 4. Document Relationships Clearly

In entity files, document relationships:

```typescript
/**
 * Lease represents a rental agreement between tenant and property.
 * 
 * Relationships:
 * - Property (ManyToOne) - The leased property
 * - Tenant (ManyToOne) - The tenant signing the lease
 * - Account (ManyToOne) - Multi-tenancy anchor
 */
@Entity("leases")
export class Lease { ... }
```

### 5. Schema Documentation in `.ai/instruct.md`

Each module's `AI-INSTRUCT.md` should reference its database architecture:

```markdown
## Database

→ [`.ai/database.md`](database.md) — Full schema documentation with table definitions.
```

---

## Example: Complete Table Definition

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from "typeorm";
import { Account } from "./account.js";

@Entity("leases")
export class Lease {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Multi-tenancy anchor
  @Column({ nullable: false })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  account: Account;

  // Standard timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Business columns
  @Column("decimal", { precision: 10, scale: 2 })
  monthlyRent: number;

  @Column({ type: "date" })
  startDate: Date;

  @Column({ type: "enum", enum: Lease.Status, default: Lease.Status.DRAFT })
  status: keyof typeof Lease.Status;
}
```

---

## Migration Example

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateLeasesTable1748352000000 implements MigrationInterface {
  name = "CreateLeasesTable1748352000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE leases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL,
        property_id UUID NOT NULL,
        tenant_id UUID NOT NULL,
        monthly_rent DECIMAL(10, 2) NOT NULL,
        start_date DATE NOT NULL,
        status VARCHAR DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_leases_account_id ON leases(account_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE leases`);
  }
}