# .archive — Vanilla JS Frontend (pre-React)

Archived: 2026-05-21

## Why this was archived

The original frontend was a vanilla JS SPA built with:
- `app.js` — router and app shell
- `main.js` — entry point
- `server.js` — local dev server
- `build.js` — manual build script
- `js/` — 15 feature modules (auth, products, search, messaging, admin, etc.)
- `css/` — per-feature stylesheets
- `styles.css` — global styles
- `index.html` — single HTML shell

It was fully replaced by a React 18 + TypeScript + Vite application in `src/` as part of the
React migration (May 2026). The migration translated all 15 vanilla JS modules 1:1 into React
components, pages, hooks, and API clients.

## Why kept (not deleted)

Retained as a reference snapshot in case specific business logic, CSS values, or API call
patterns from the original implementation need to be consulted. This is not production code
and is never bundled — Vite's entry is `src/main.tsx`.

## Contents

| Path | Was |
|------|-----|
| `app.js` | Router, page mounting, auth guard |
| `main.js` | App entry point |
| `server.js` | Express dev server (now handled by `api/`) |
| `build.js` | Manual asset build script |
| `styles.css` | Global stylesheet |
| `index.html` | HTML shell |
| `js/admin.js` | Admin panel logic |
| `js/auth.js` | Login/register/session |
| `js/bulletin-board.js` | Bulletin board page |
| `js/cart.js` | Shopping cart |
| `js/data.js` | Shared data/state |
| `js/messaging.js` | Messaging UI |
| `js/notifications.js` | Notification feed |
| `js/producer-queue.js` | Producer job queue |
| `js/products.js` | Product listing + detail |
| `js/render.js` | DOM rendering helpers |
| `js/search.js` | Search + filter logic |
| `js/theme.js` | Dark/light mode |
| `js/ui.js` | Shared UI utilities |
| `js/utils.js` | General helpers |
| `js/websocket.js` | Socket.IO client |
| `css/` | Per-feature stylesheets |
