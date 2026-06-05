# ResumeServer — AI-INSTRUCT

**Authority**: DEEP — Authoritative for all work inside `ResumeServer/`
**Parent context**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md)
**Last Updated**: 2026-05-12

---

## Quick Reference

| Need | Go to |
|------|-------|
| React frontend | [client/AI-INSTRUCT.md](client/AI-INSTRUCT.md) |
| Express API & services | [server/AI-INSTRUCT.md](server/AI-INSTRUCT.md) |
| Chrome extension | [chrome-extension/AI-INSTRUCT.md](chrome-extension/AI-INSTRUCT.md) |
| Admin & deployment | [admin/AI-INSTRUCT.md](admin/AI-INSTRUCT.md) |
| Naming conventions | [../AI-INSTRUCT/AI-CONVENTIONS.md](../AI-INSTRUCT/AI-CONVENTIONS.md) |
| Archiving patterns | [../AI-INSTRUCT/AI-MAINTENANCE.md](../AI-INSTRUCT/AI-MAINTENANCE.md) |

---

## Purpose

ResumeServer is the full application layer of Resume-Suite. It contains the React SPA, Express API, Chrome extension, and admin tooling. The server is the single source of truth for all user data and orchestrates all LLM, ATS, and build operations.

---

## Directory Structure

```
ResumeServer/
├── AI-INSTRUCT.md
├── package.json                   ← Root package (Vite + Express monorepo-style)
├── .env.example                   ← Required env vars (never commit .env)
├── .gitignore
├── client/                        ← React 18 + Vite SPA
│   ├── AI-INSTRUCT.md
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── pages/
│       │   ├── Login.jsx          ← Login form
│       │   ├── Dashboard.jsx      ← Listing cards + pipeline status
│       │   ├── Workspace.jsx      ← Per-listing workflow + file browser
│       │   ├── Parts.jsx          ← (legacy) redirect — Parts now in Sources
│       │   ├── Sources.jsx        ← Source docs upload, Parts management, template upload, skills analysis
│       │   ├── Insight.jsx        ← Single-shot career advisor (POST /api/insight/query)
│       │   ├── AiChat.jsx         ← Multi-turn chat assistant (POST /api/aichat/message)
│       │   └── Admin.jsx          ← User management (admin only)
│       ├── components/
│       │   ├── WorkflowPanel.jsx
│       │   ├── WorkflowStep.jsx
│       │   ├── ListingCard.jsx
│       │   ├── FileList.jsx
│       │   ├── FileEditor.jsx     ← Inline markdown editor (used in Sources + Parts)
│       │   ├── UploadZone.jsx
│       │   ├── Nav.jsx
│       │   ├── Sidebar.jsx
│       │   └── ProtectedRoute.jsx
│       ├── hooks/                 ← Custom React hooks
│       ├── api-client.js          ← Single fetch wrapper for all API calls
│       └── main.jsx
├── server/                        ← Express API
│   ├── AI-INSTRUCT.md
│   ├── server.js                  ← Entry point, binds port 38291
│   ├── database/
│   │   ├── database.js            ← Centralized DB access (all queries here)
│   │   ├── init-database.js       ← Schema creation on startup
│   │   └── schema.sql
│   ├── routes/
│   │   ├── auth.js                ← POST /api/auth/login, /register
│   │   ├── listings.js            ← Listing CRUD
│   │   ├── parts.js               ← Parts file upload/list/edit
│   │   ├── sources.js             ← Source docs, skills analysis, template management
│   │   ├── workflow.js            ← Workflow step triggers
│   │   ├── files.js               ← Artifact download
│   │   ├── insight.js             ← POST /api/insight/query (single-shot career advice)
│   │   ├── aichat.js              ← POST /api/aichat/message (multi-turn chat w/ profile context)
│   │   ├── admin.js               ← User management (admin only)
│   │   └── extension.js           ← Chrome extension distribution
│   ├── middleware/
│   │   ├── auth.js                ← JWT verification middleware
│   │   ├── upload.js              ← Multer configuration
│   │   └── rate-limit.js          ← express-rate-limit configuration
│   ├── services/
│   │   ├── llm-client.js          ← LLM Studio API wrapper (ONLY place that calls LLM)
│   │   ├── ats-scorer.js          ← Spawns Python ats_multi_score.py subprocess
│   │   ├── builder.js             ← Spawns Pandoc subprocess for DOCX/PDF
│   │   ├── file-store.js          ← Abstract file storage (local FS, swappable to R2)
│   │   ├── job-queue.js           ← PostgreSQL-backed async job queue
│   │   └── prompts/               ← LLM prompt templates
│   │       ├── analysis.js
│   │       ├── draft-000.js
│   │       └── draft-001.js
│   └── config/
│       └── env.js                 ← Validates required env vars on startup
├── chrome-extension/              ← Enhanced Indeed/LinkedIn extractor
│   ├── AI-INSTRUCT.md
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   ├── settings.html              ← Server URL + token configuration
│   ├── settings.js
│   └── icons/
└── admin/
    ├── AI-INSTRUCT.md
    └── scripts/
        ├── setup.js               ← First-run database init + admin user seed
        └── seed-user.js           ← Create a new user account manually
```

---

## Architecture Rules

1. **One LLM caller** — only `server/services/llm-client.js` may call LLM Studio. No route handler calls it directly.
2. **One DB layer** — only `server/database/database.js` may issue queries. Routes call services, services call `database.js`.
3. **Abstract file storage** — all file reads/writes go through `server/services/file-store.js`. Never use `fs` directly in routes or other services.
4. **Async job queue** — all LLM generation steps are enqueued, not awaited inline. The client polls job status.
5. **React served by Vite in dev, by Express static in production** — Express serves the Vite build from `client/dist/` when `NODE_ENV=production`.

---

## Environment Variables

> Full list in `.env.example`. All required vars are validated at startup by `server/config/env.js`.

| Variable | Description |
|----------|-------------|
| `PORT` | Express listen port (default: 38291) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars) |
| `LLM_API_URL` | LLM Studio base URL (default: http://localhost:1234) |
| `LLM_MODEL` | Model name (qwen3.6-27b) |
| `USERDATA_PATH` | Absolute path to UserData directory |
| `NODE_ENV` | `development` or `production` |

---

## Port

Express listens on **38291**. In development, Vite dev server proxies `/api/*` to this port.

---

## Development Notes

Active dev notes → `.dev.md/`
Stale/superseded docs → `.dev.md/.old.mds/`
See [../AI-INSTRUCT/AI-MAINTENANCE.md](../AI-INSTRUCT/AI-MAINTENANCE.md) for full archiving rules.
