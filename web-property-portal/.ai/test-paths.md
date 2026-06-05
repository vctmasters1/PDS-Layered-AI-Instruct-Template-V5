# Test Paths — web-property-portal

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 13 (multi-tenant property management: properties, tenants, leases, maintenance, transactions, documents, cross-account isolation)

TypeScript/Express API with a repository pattern. Multi-tenancy via `X-Account-ID` request header validated by `middleware/accountValidation.ts`. Auth header defined but JWT not fully wired at time of writing — checkpoints note where that matters. Existing test files live in `tests/api/` and `tests/e2e/`.

---

## Checkpoints

### 1. TypeScript compiles without errors
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-property-portal && npx tsc --noEmit 2>&1 && echo "TYPECHECK_OK"
```
**Pass**: `TYPECHECK_OK` printed, no errors
**On fail**: Missing `package.json` or `tsconfig.json` — scaffold them first; common error is missing type declarations for Express if `@types/express` is not installed

---

### 2. Existing API tests pass
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-property-portal && npx jest tests/api --passWithNoTests 2>&1
```
**Pass**: All API test files (`properties.test.ts`, `tenants.test.ts`, `leases.test.ts`, `maintenance.test.ts`, `transactions.test.ts`, `documents.test.ts`) pass or output `No tests found` (if stubs only)
**On fail**: Check for missing test setup (DB connection, seed data); update `jest.config.js` to include `testMatch: ['**/tests/**/*.test.ts']`

---

### 3. GET /api/v1/properties — requires X-Account-ID header
**Type**: manual
**Pass**: `GET /api/v1/properties` without `X-Account-ID` header → 401 or 400 with error message; same request with `X-Account-ID: acct-001` → 200 with array (possibly empty)
**On fail**: `middleware/accountValidation.ts` not mounted on the properties router; check `src/api/v1/properties.ts` router registration

---

### 4. POST /api/v1/properties — creates property under correct account
**Type**: manual
**Pass**: POST with `X-Account-ID: acct-001` and `{ address, type, bedrooms, bathrooms }` → 201 with `{ id, accountId: "acct-001", ... }`; row in DB has `accountId = "acct-001"`
**On fail**: `PropertyRepository.ts` `.create()` not setting `accountId` from the request context; check how `accountId` is threaded from middleware to repository

---

### 5. GET /api/v1/tenants — returns tenants scoped to account
**Type**: manual
**Pass**: Tenants created under `acct-001` are NOT returned when requesting with `X-Account-ID: acct-002`; only tenants belonging to `acct-002` are returned
**On fail**: `TenantRepository.ts` `.findAll()` is missing a `WHERE accountId = ?` clause — this is the core multi-tenancy isolation check

---

### 6. POST /api/v1/leases — links tenant to property within same account
**Type**: manual
**Pass**: POST with a `tenantId` and `propertyId` both belonging to `acct-001` (with that header) → 201; attempting to use a `propertyId` from `acct-002` returns 404 or 403
**On fail**: `LeaseRepository.ts` is not validating that both entities belong to the requesting account before creating the FK relationship

---

### 7. POST /api/v1/maintenance — ticket created and retrievable
**Type**: manual
**Pass**: POST maintenance request `{ propertyId, description, priority }` → 201 with `{ id, status: "open" }`; `GET /api/v1/maintenance/:id` returns same record
**On fail**: `MaintenanceRepository.ts` is not persisting `status` default; check entity default value

---

### 8. POST /api/v1/transactions — financial record stored
**Type**: manual
**Pass**: POST `{ propertyId, amount, type: "rent", date }` → 201; `GET /api/v1/transactions?propertyId=X` returns that record; amount stored as-is (no rounding errors)
**On fail**: Amount stored as float causing precision issues — ensure the DB column type is `decimal(10,2)` not `float`

---

### 9. Cross-account isolation — account A cannot read account B data
**Type**: manual
**Pass**: Create a property under `acct-A`; send `GET /api/v1/properties/:id` with `X-Account-ID: acct-B` → 404 (not 403, to avoid leaking existence); DB has `accountId = "acct-A"` on that row
**On fail**: Repository `.findById()` is not filtering by `accountId` — this is a data isolation violation; fix immediately in the repository layer

---

### 10. GET /api/v1/account/status — returns account metadata
**Type**: manual
**Pass**: `GET /api/v1/account/status` with `X-Account-ID: acct-001` → 200 with `{ accountId, plan, storageUsedBytes, propertyCount }`
**On fail**: `services/AccountService.ts` is aggregating across all accounts instead of filtering by `accountId`; check the SQL/ORM query

---

### 11. E2E tests pass (stub check)
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-property-portal && npx jest tests/e2e --passWithNoTests 2>&1
```
**Pass**: Tests pass or `No tests found` (e2e stubs exist but may be empty)
**On fail**: E2E tests require a running server; add `--testPathIgnorePatterns=tests/e2e` to the CI config until the server is deployable
