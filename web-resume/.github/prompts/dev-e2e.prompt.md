---
description: "End-to-end test of all Resume Suite web interface features — auth, listings CRUD, parts upload/delete, workflow pipeline triggers, job polling, file downloads, admin user management, and extension download. Run after any server changes to verify nothing is broken."
name: "dev-e2e"
agent: agent
tools: [run_in_terminal, get_terminal_output]
---

Run a full end-to-end test of the Resume Suite API. The server must be running on `http://localhost:38291` before starting. Use PowerShell `Invoke-RestMethod` for JSON endpoints.

Work from `k:\PDS_AutomationSuite\WEB-Resume\ResumeServer`. Keep a running pass/fail tally and print a summary at the end.

---

## Test Credentials

Use the existing admin account:
- username: `vmas`  password: `ResumeAdmin!`

Create a temporary second user for isolation tests:
- username: `e2e-test`  fullName: `E2E Tester`  password: `E2eTest99!`

Clean up the temp user and all test listings at the end.

---

## Test Suite

### 0 — Health

```
GET /api/health
```
Expect: `{ ok: true }`

---

### 1 — Auth: Login (valid)

```
POST /api/auth/login  { username, password }
```
Expect: `success=true`, `data.token` is a non-empty string, `data.user.role == "admin"`.

Store the token as `$TOKEN` and set `$HDR = @{Authorization="Bearer $TOKEN"}` for all subsequent requests.

---

### 2 — Auth: Login (bad password)

```
POST /api/auth/login  { username: "vmas", password: "wrongpassword" }
```
Expect: HTTP 401, `success=false`.

---

### 3 — Auth: Protected route rejects no token

```
GET /api/listings  (no Authorization header)
```
Expect: HTTP 401.

---

### 4 — Listings: Create

```
POST /api/listings  { title: "E2E Test Corp — QA Engineer", content: "Required: LabVIEW, PLC, DAQ, Git. Preferred: SCADA, SQL." }
```
Expect: `success=true`, `data.id` is a number, `data.folder_name` starts with `0001-` or similar, `data.slug` contains `E2E`.

Store `$LISTING_ID = $data.id` and `$FOLDER_NAME = $data.folder_name`.

---

### 5 — Listings: List

```
GET /api/listings
```
Expect: array, contains the listing just created (match by id).

---

### 6 — Listings: Get by ID

```
GET /api/listings/$LISTING_ID
```
Expect: `data.id == $LISTING_ID`, `data.content` contains `LabVIEW`.

---

### 7 — Parts: Upload

Create a temp file `e2e-experience.md` with content `# Experience\n- LabVIEW developer` then upload it:

```
POST /api/parts  multipart/form-data  file=e2e-experience.md
```
Expect: `success=true`, `data.filename == "e2e-experience.md"`.

---

### 8 — Parts: List

```
GET /api/parts
```
Expect: array includes `"e2e-experience.md"`.

---

### 9 — Parts: Reject bad extension

Upload a file named `test.exe` (any content):
```
POST /api/parts  multipart/form-data  file=test.exe
```
Expect: HTTP 400 or a non-success response.

---

### 10 — Workflow: Pipeline status (fresh listing)

```
GET /api/workflow/$LISTING_ID/status
```
Expect: `analyze.status == "ready"`, all other steps are `"locked"` or `"ready"`.

---

### 11 — Workflow: Trigger analyze step

```
POST /api/workflow/$LISTING_ID/analyze
```
Expect: `success=true`, `data.jobId` is a number, `data.queued=true`.

Store `$JOB_ID = $data.jobId`.

---

### 12 — Workflow: Job status

```
GET /api/workflow/$LISTING_ID/jobs/$JOB_ID
```
Expect: `data.step == "analyze"`, `data.status` is one of `pending | running | done | error`.

---

### 13 — Workflow: Dedup — triggering same step again returns existing job

```
POST /api/workflow/$LISTING_ID/analyze   (immediately after step 11, while job may still be pending)
```
Expect: `success=true`, `data.queued=false` (returns existing pending/running job).

---

### 14 — Workflow: Invalid step rejected

```
POST /api/workflow/$LISTING_ID/nonexistent-step
```
Expect: HTTP 400.

---

### 15 — Workflow: Ownership check

Log in as `e2e-test` user (register first if needed) and try to access the listing:
```
GET /api/workflow/$LISTING_ID/status   (with e2e-test token)
```
Expect: HTTP 404 (listing not found for that user).

---

### 16 — Files: 404 for non-existent file

```
GET /api/files/$LISTING_ID/does-not-exist.md
```
Expect: HTTP 404.

---

### 17 — Admin: User list (admin token)

```
GET /api/extension/users
```
Expect: array containing at least `vmas`.

---

### 18 — Admin: User list rejected for non-admin

Using the `e2e-test` token (role=user):
```
GET /api/extension/users
```
Expect: HTTP 403.

---

### 19 — Extension: Download ZIP

```
GET /api/extension/download
```
Expect: HTTP 200, `Content-Type: application/zip`, response body is non-empty (use `-OutFile` to a temp path and verify file size > 0).

---

## Cleanup

1. Delete the test listing: `DELETE /api/listings/$LISTING_ID` — expect 200.
2. Confirm it's gone: `GET /api/listings/$LISTING_ID` — expect 404.
3. Delete the test part: `DELETE /api/parts/e2e-experience.md` — expect 200.
4. Delete the `e2e-test` user directly via SQL if registered (use `node -e` + the database module, or skip if not created).
5. Delete temp files created on disk.

---

## Summary

Print a table of all test results:

```
Test  Description                          Result
----  -----------------------------------  ------
 0    Health check                         PASS
 1    Login valid                          PASS
...
19    Extension ZIP download               PASS

Passed: 20/20
```

If any test fails, print the full response body for that test and continue running the rest. At the end, if any failures exist, print `SUITE FAILED` and list the failing test numbers.
