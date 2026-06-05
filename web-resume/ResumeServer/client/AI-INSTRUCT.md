# client/ — AI-INSTRUCT

**Authority**: DEEP — Authoritative for all work inside `ResumeServer/client/`
**Parent context**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md)
**Last Updated**: 2026-05-12

---

## Purpose

The React SPA that users interact with. Handles all UI rendering, user interactions, and communicates with the server API exclusively through `api-client.js`.

---

## Directory Structure

```
client/
├── AI-INSTRUCT.md
├── index.html
├── vite.config.js
└── src/
    ├── main.jsx                   ← React entry point
    ├── App.jsx                    ← Router root; routes: / dashboard /workspace/:id /sources /insight /ai-chat /admin
    ├── api-client.js              ← All API calls go through here
    ├── pages/
    │   ├── Login.jsx              ← Login form
    │   ├── Dashboard.jsx          ← Listing cards + pipeline status overview
    │   ├── Workspace.jsx          ← Per-listing workflow steps + file browser
    │   ├── Sources.jsx            ← Source doc upload, Parts management, skills analysis, template upload/edit
    │   ├── Insight.jsx            ← Single-shot career advisor (POST /api/insight/query)
    │   ├── AiChat.jsx             ← Multi-turn chat assistant with full profile context (POST /api/aichat/message)
    │   └── Admin.jsx              ← User management (admin only)
    ├── components/
    │   ├── WorkflowPanel.jsx      ← Pipeline steps container; renders WorkflowStep rows
    │   ├── WorkflowStep.jsx       ← Single pipeline step: label, badge, run button, artifacts
    │   ├── ListingCard.jsx        ← Summary card for a job listing (includes FitBadge)
    │   ├── FileList.jsx           ← Artifact download list
    │   ├── FileEditor.jsx         ← Inline markdown editor used in Sources + Parts sections
    │   ├── UploadZone.jsx         ← Drag-and-drop file uploader
    │   ├── Nav.jsx                ← Top navigation bar
    │   ├── Sidebar.jsx            ← Resizable sidebar: listings + parts navigation
    │   └── ProtectedRoute.jsx     ← JWT auth guard
    └── hooks/
        ├── useAuth.jsx            ← JWT storage and user state
        ├── useJobPoller.js        ← Polls /api/workflow/:id/jobs/:jobId until done
        └── useApi.js              ← Thin hook wrapping api-client.js
```

---

## What Belongs Here

- React pages, components, hooks
- CSS modules or a single `styles/` directory
- Static assets (icons, images) under `src/assets/`
- Vite configuration

## What Does NOT Belong Here

- Business logic → `server/`
- Database operations → `server/database/`
- LLM calls → `server/services/llm-client.js`
- Server configuration → `server/config/`

---

## Key Patterns

### All API Calls Through `api-client.js`

Every fetch to the server goes through `api-client.js`. No component or hook imports `fetch` directly.

```js
// api-client.js attaches the JWT header and handles 401 redirects centrally
const listings = await api.get('/listings');
```

### Auth

- JWT is stored in `localStorage` under the key `rs_token`
- `useAuth.js` exposes `{ user, token, login, logout }`
- `ProtectedRoute.jsx` redirects to `/login` if no valid token
- Never store passwords or sensitive data in localStorage — token only

### Async Workflow Steps

LLM generation steps are async (10–60s). After triggering a step:
1. The API returns a `jobId` immediately
2. `useJobPoller.js` polls `GET /api/workflow/:listingId/jobs/:jobId` every 3 seconds
3. The `WorkflowStep` component shows a spinner until `status === 'done'` or `'error'`

Never await a generation step inline — always use the job queue pattern.

### Workflow Step States

Each step in `WorkflowStep.jsx` can be in one of these states:

| State | Meaning |
|-------|---------|
| `locked` | Prerequisites not met — button disabled |
| `ready` | Can be triggered |
| `running` | Job queued or in progress — spinner |
| `done` | Artifact exists — shows download link |
| `error` | Step failed — shows retry button |

### Responsive Design

- Mobile-first CSS
- Breakpoints: 480px (mobile), 768px (tablet), 1024px+ (desktop)
- Minimum tap target: 44px
- CSS variables for all colors and spacing — no hardcoded values in components

### Accessibility

- Semantic HTML5 elements (`<nav>`, `<main>`, `<article>`, `<section>`)
- ARIA labels for icon-only buttons
- All images have `alt` text
- Keyboard navigation for all interactive elements

---

## Vite Configuration

- Dev server proxies `/api/*` → `http://localhost:38291`
- Build output goes to `client/dist/` (served by Express in production)

---

## Development Notes

Active dev notes → `.dev.md/`
Stale/superseded docs → `.dev.md/.old.mds/`
See [../../AI-INSTRUCT/AI-MAINTENANCE.md](../../AI-INSTRUCT/AI-MAINTENANCE.md) for full archiving rules.
