# server/ — AI-INSTRUCT

**Authority**: DEEP — Authoritative for all work inside `ResumeServer/server/`
**Parent context**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md)
**Last Updated**: 2026-05-12

---

## Purpose

Express API, database access, authentication, all business logic, LLM orchestration, ATS scoring, and document building. The server is the single source of truth — the client never bypasses it.

---

## Directory Structure

```
server/
├── AI-INSTRUCT.md
├── server.js                      ← Entry point; binds port 38291
├── database/
│   ├── database.js                ← ALL DB queries go through here
│   ├── init-database.js           ← Creates tables on first run
│   └── schema.sql                 ← Canonical schema definition
├── routes/
│   ├── auth.js                    ← POST /api/auth/login, /register
│   ├── listings.js                ← GET/POST/DELETE /api/listings
│   ├── parts.js                   ← GET/POST/PUT/DELETE /api/parts
│   ├── sources.js                 ← /api/sources — upload/edit source docs, skills analysis, template
│   ├── workflow.js                ← POST /api/workflow/:id/<step>, GET status
│   ├── files.js                   ← GET /api/files/:listingId/:filename
│   ├── insight.js                 ← POST /api/insight/query — single-shot career advisor LLM call
│   ├── aichat.js                  ← POST /api/aichat/message — multi-turn chat, injects full profile as system context
│   ├── admin.js                   ← /api/admin — user CRUD (admin role required)
│   └── extension.js               ← GET /api/extension/download
├── middleware/
│   ├── auth.js                    ← JWT verification; attaches req.user
│   ├── upload.js                  ← Multer config (markdown + docx only)
│   └── rate-limit.js              ← express-rate-limit setup
├── services/
│   ├── llm-client.js              ← ONLY place that calls LLM Studio
│   ├── ats-scorer.js              ← Spawns Python subprocess
│   ├── builder.js                 ← Spawns Pandoc subprocess
│   ├── file-store.js              ← Abstract FS layer (local now, R2-swappable)
│   ├── job-queue.js               ← PostgreSQL-backed async queue
│   └── prompts/
│       ├── analysis.js            ← Prompt template: job req extraction + match analysis
│       ├── draft-000.js           ← Prompt template: first-pass resume
│       ├── draft-001.js           ← Prompt template: ATS-gap revision
│       ├── parts-extract.js       ← Prompt template + PARTS_MANIFEST for build-parts step
│       ├── skills-analyze.js      ← Prompt template: skills extraction from source docs
│       └── template-analyze.js    ← Prompt template: style guide from uploaded resume templates
└── config/
    └── env.js                     ← Validates all required env vars at startup
```

---

## What Belongs Here

- API endpoint handlers (routes only — no business logic inline)
- Database access layer
- Authentication and session management
- Input validation and sanitization
- Middleware (auth, rate-limiting, CORS, uploads)
- Service orchestration (LLM, ATS, build)

## What Does NOT Belong Here

- HTML/CSS/React → `client/`
- Chrome extension code → `chrome-extension/`
- Deployment scripts → `admin/`

---

## Architectural Laws

### 1. All Database Access Through One Layer

```js
// See server/AI-INSTRUCT.md — all DB access must go through the centralized database layer
const result = await db.query(SQL, params);
```

Never query the database directly from route handlers or services other than `database/database.js`.

### 2. All LLM Calls Through `llm-client.js`

No route or service may call LLM Studio directly. All LLM interactions go through `services/llm-client.js`. This enables swapping the model or provider in one place.

```js
// See server/AI-INSTRUCT.md — all LLM calls must go through llm-client.js
const result = await llm.complete(prompt, { temperature: 0.3 });
```

### 3. All File I/O Through `file-store.js`

No service or route may use Node `fs` directly. All file operations go through `services/file-store.js`.

```js
// See server/AI-INSTRUCT.md — all file I/O must go through file-store.js
await fileStore.writeFile(userPath, filename, content);
```

### 4. Generation Steps Are Always Async

LLM generation takes 10–60s. Every workflow step (analyze, draft, score, build) must:
1. Enqueue a job via `job-queue.js` and return `{ jobId }` immediately
2. Process the job in the background
3. Update job status in the database when done

Never await LLM calls inline in a route handler.

---

## API Design

- RESTful: GET / POST / PUT / DELETE
- Consistent response envelope:
  ```json
  { "success": true, "data": {} }
  { "success": false, "error": "Human-readable message" }
  ```
- Correct HTTP status codes: 200, 201, 400, 401, 403, 404, 500
- CORS: only the client origin is whitelisted (not `*`)

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account (admin-invite only or open) |
| POST | `/api/auth/login` | Returns JWT |

### Listings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/listings` | All listings for current user |
| POST | `/api/listings` | Create listing (body: title, content) |
| DELETE | `/api/listings/:id` | Delete listing and all artifacts |

### Parts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/parts` | List user's Parts files |
| POST | `/api/parts` | Upload a Part file (multipart) |
| DELETE | `/api/parts/:filename` | Remove a Part file |

### Workflow
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/workflow/:listingId/analyze` | Enqueue analysis step |
| POST | `/api/workflow/:listingId/draft/000` | Enqueue pass-000 draft |
| POST | `/api/workflow/:listingId/score/000` | Enqueue ATS score for pass-000 |
| POST | `/api/workflow/:listingId/draft/001` | Enqueue pass-001 revision |
| POST | `/api/workflow/:listingId/score/001` | Enqueue ATS score for pass-001 |
| POST | `/api/workflow/:listingId/build` | Enqueue DOCX+PDF build |
| GET | `/api/workflow/:listingId/status` | Pipeline state for all steps |
| GET | `/api/workflow/:listingId/jobs/:jobId` | Job status (pending/running/done/error) |

### Files
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/files/:listingId/:filename` | Download any artifact |

### Extension
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/extension/download` | Download chrome-extension as ZIP |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List all users (admin only) |
| POST | `/api/admin/users/:id/role` | Change a user's role (admin only) |

---

## Database Schema (summary)

See `database/schema.sql` for full definition.

| Table | Purpose |
|-------|---------|
| `users` | Accounts: id, username, full_name, password_hash, role, created_at |
| `listings` | Job descriptions: id, user_id, slug, title, content, created_at |
| `workflow_jobs` | Async job queue: id, user_id, listing_id, step, status, error, created_at, updated_at |
| `artifacts` | Generated file metadata: id, listing_id, filename, step, created_at |

---

## Security Rules

- Hash passwords with **bcryptjs** (12 rounds minimum) — never store plaintext
- Validate and sanitize **all** user inputs at the API boundary
- Never expose internal error details, stack traces, or file paths to the client
- Use HTTPS in production (reverse proxy or SSL cert)
- Rate limit all public-facing endpoints
- Use parameterized queries everywhere — never concatenate SQL strings
- No hardcoded credentials anywhere — use environment variables validated by `config/env.js`
- Uploaded files: validate MIME type and extension, max size 2MB, store outside web root

## Upload Constraints

| Field | Constraint |
|-------|-----------|
| Allowed types | `.md`, `.txt` (Parts); `.md` (Listings) |
| Max file size | 2MB |
| Storage location | `UserData/<username>/Parts/` or `UserData/<username>/Listings/` |
| Filename | Sanitized — no path traversal characters |

---

## LLM Client

`services/llm-client.js` wraps the LLM Studio OpenAI-compatible API.

- **Base URL**: `process.env.LLM_API_URL` (default: `http://localhost:1234`)
- **Model**: `process.env.LLM_MODEL` (default: `qwen3.6-27b`)
- **Endpoint**: `POST /v1/chat/completions`
- Timeout: 120s per request
- On timeout or error: job marked as `error`, message stored in `workflow_jobs.error`

---

## ATS Scorer

`services/ats-scorer.js` spawns `server/scripts/ats_multi_score.py`.

```js
// spawns: python ats_multi_score.py --listing <path> --root <userDataPath> --pass <000|001>
await atsScorer.score({ listingPath, userRoot, pass });
```

---

## Document Builder

`services/builder.js` spawns Pandoc to convert `<Name>-001.md` → `.docx` → `.pdf`.

- Pandoc must be installed on the host machine
- Reference doc: `server/templates/reference.docx`
- If Pandoc is not found, the build step returns a clear error (not a crash)

---

## Development Notes

Active dev notes → `.dev.md/`
Stale/superseded docs → `.dev.md/.old.mds/`
See [../../AI-INSTRUCT/AI-MAINTENANCE.md](../../AI-INSTRUCT/AI-MAINTENANCE.md) for full archiving rules.
