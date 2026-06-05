# Test Paths — db-central

**Last Updated**: 2026-05-28
**System Map Reference**: Cross-cutting — shared schema consumed by WEB-HMI, WEB-Marketplace, and WEB-FwServer via `@pds/db-central` npm package.

41 TypeORM entities. `synchronize: false` everywhere — schema is managed only through migrations in this package. Only 2 migrations exist currently (one for property entities). This is the highest-risk module for post-consolidation breakage.

---

## Checkpoints

### 1. Package builds without TypeScript errors
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\db-central && npm run build 2>&1 && echo "BUILD_OK"
```
**Pass**: `BUILD_OK` printed; `dist/` populated with entity JS files
**On fail**: Run `npx tsc --noEmit` — most likely cause is an entity referencing a column type from a service-specific import that doesn't belong in the shared package

---

### 2. Entity index exports all 41 entities
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\db-central && node -e "
const entities = require('./dist/src/entities/index.js');
const names = Object.keys(entities);
console.log('Exported entities:', names.length);
console.log(names.sort().join(', '));
if (names.length < 40) { console.error('FAIL — fewer entities than expected'); process.exit(1); }
"
```
**Pass**: Prints 41+ entity class names; list includes `Device`, `User`, `Order`, `Firmware`, `TelemetryLog`, `Property`, `Lease`, `Transaction`
**On fail**: An entity is not re-exported from `src/entities/index.ts` — add the missing export

---

### 3. No duplicate table names across entities
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\db-central && node -e "
const entities = require('./dist/src/entities/index.js');
const seen = new Map();
let ok = true;
for (const [name, cls] of Object.entries(entities)) {
  // TypeORM stores table name in entity metadata options
  const meta = Reflect.getMetadata('custom:entity_options', cls) 
            || Reflect.getMetadata('typeorm:entity_options', cls);
  const table = (meta && meta.name) ? meta.name : name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  if (seen.has(table)) {
    console.error('FAIL — duplicate table name:', table, '(', name, 'vs', seen.get(table), ')');
    ok = false;
  } else {
    seen.set(table, name);
  }
}
if (ok) console.log('OK — no duplicate table names across', seen.size, 'entities');
process.exit(ok ? 0 : 1);
"
```
**Pass**: `OK — no duplicate table names across 41 entities`
**On fail**: Two entities map to the same table — this is the known "entity collision" risk after consolidating HMI + Marketplace schemas; rename one entity's `@Entity('table_name')` decorator

---

### 4. Migrations run without errors on a fresh DB
**Type**: manual
**Pass**: 
1. `docker compose up -d` (from any service's docker-compose.yml pointing to shared PostgreSQL)
2. `cd k:\PDS-Master-001\db-central && npm run migrate`
3. Command exits 0; all tables exist in the DB (`\dt` in psql should show 41 tables)
**On fail**: A migration references an entity that was renamed or removed — check `migrations/` SQL statements against the current entity list; if the migration history is corrupt, `npm run migrate:show` reveals pending vs applied state

---

### 5. @pds/db-central resolves from all three consumer APIs
**Type**: auto
**Command**:
```shell
node -e "
const paths = [
  'k:/PDS-Master-001/web-hmi/api',
  'k:/PDS-Master-001/web-marketplace/api',
  'k:/PDS-Master-001/web-firmware-server/api'
];
let ok = true;
for (const p of paths) {
  try {
    require(p + '/node_modules/@pds/db-central/dist/src/entities/index.js');
    console.log('OK:', p.split('/').slice(-2).join('/'));
  } catch(e) {
    // Try resolving the package.json to see if it's linked
    const fs = require('fs');
    const pkgPath = p + '/node_modules/@pds/db-central/package.json';
    if (fs.existsSync(pkgPath)) {
      console.log('OK (pkg exists):', p.split('/').slice(-2).join('/'));
    } else {
      console.error('FAIL — @pds/db-central not found in:', p);
      ok = false;
    }
  }
}
process.exit(ok ? 0 : 1);
"
```
**Pass**: All three services report `OK`
**On fail**: Run `npm install` inside the failing service — the `@pds/db-central` workspace dependency is not linked; check the service's `package.json` for `"@pds/db-central": "file:../../db-central"` (path may differ by nesting level)

---

### 6. Entity column types are PostgreSQL-compatible (no SQLite-only types)
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\db-central && node -e "
const fs = require('fs'), path = require('path'), glob = require('glob');
const files = glob.sync('src/entities/*.ts', {cwd: process.cwd()});
const sqliteOnly = ['simple-array', 'simple-json'];
let ok = true;
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  for (const t of sqliteOnly) {
    if (content.includes(t)) {
      console.error('FAIL —', f, 'uses SQLite-only type:', t);
      ok = false;
    }
  }
}
if (ok) console.log('OK — no SQLite-only column types in', files.length, 'entities');
process.exit(ok ? 0 : 1);
" 2>&1
```
**Pass**: `OK — no SQLite-only column types in 41 entities`
**On fail**: An entity migrated from a SQLite-based project (e.g. web-resume) was accidentally included — move it back to the local project or replace the column type with `jsonb` / `text[]`
