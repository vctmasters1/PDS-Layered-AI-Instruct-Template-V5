# chrome-extension/ — AI-INSTRUCT

**Authority**: DEEP — Authoritative for all work inside `ResumeServer/chrome-extension/`
**Parent context**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md)
**Last Updated**: 2026-05-12

---

## Purpose

A Chrome Manifest V3 extension that extracts job descriptions from Indeed and LinkedIn. Enhanced over the original extractor to support sending directly to the server in addition to the original local-download mode.

---

## Source Reference

All changes live in this directory.

---

## Directory Structure

```
chrome-extension/
├── AI-INSTRUCT.md
├── manifest.json              ← Manifest V3
├── content.js                 ← DOM scraper (Indeed + LinkedIn)
├── background.js              ← Service worker; handles download + server POST
├── popup.html                 ← Main action popup
├── popup.js                   ← Extract button logic; mode selection
├── settings.html              ← Server URL + API token configuration
├── settings.js                ← Reads/writes chrome.storage.local
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Two Operating Modes

The extension supports both modes simultaneously. The user chooses in the popup per-extraction.

### Mode 1: Local Download (original behavior)
- Saves the extracted job description as a `.res.md` file to the browser's Downloads folder
- Works without any server configuration
- Identical behavior to the original `indeed-extractor`

### Mode 2: Send to Server
- POSTs the extracted markdown to `POST /api/listings` on the configured Resume-Suite server
- Requires a valid API token (obtained from the user's account settings page)
- On success: shows a confirmation with a link to the new listing in the web UI
- On failure: falls back gracefully with an error message; does NOT auto-download as fallback

---

## Settings Storage

Settings are stored in `chrome.storage.local` (not `sync` — server URL is machine-specific).

| Key | Value |
|-----|-------|
| `rs_server_url` | Base URL of the Resume-Suite server (e.g. `http://192.168.1.100:38291`) |
| `rs_api_token` | JWT token from the user's account page |

Settings are read and written exclusively through `settings.js`. No other file accesses `chrome.storage` directly.

---

## Security Rules

- The API token is stored in `chrome.storage.local`, not `localStorage` (extension-only access)
- Never log the token to the console
- The settings page must warn the user if the server URL is not HTTPS in a production context
- All server requests use `Authorization: Bearer <token>` header
- Content scripts do not have access to the token — only `background.js` makes server calls

---

## Distribution

The extension is distributed as a ZIP via `GET /api/extension/download` from the server. Users download and load it unpacked in Chrome. There is no Chrome Web Store publication.

The server packages the `chrome-extension/` directory at build time (excluding `AI-INSTRUCT.md` and `.dev.md/`).

---

## Supported Sites

- `*://*.indeed.com/*`
- `*://*.linkedin.com/*`

Adding new sites requires updating both `manifest.json` (`host_permissions` + `content_scripts.matches`) and the DOM parsing logic in `content.js`.

---

## Development Notes

Active dev notes → `.dev.md/`
Stale/superseded docs → `.dev.md/.old.mds/`
See [../../AI-INSTRUCT/AI-MAINTENANCE.md](../../AI-INSTRUCT/AI-MAINTENANCE.md) for full archiving rules.
