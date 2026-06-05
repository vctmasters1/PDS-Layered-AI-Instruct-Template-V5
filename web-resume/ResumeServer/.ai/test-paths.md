# Test Paths — web-resume / ResumeServer

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 12 (register/login, PDF upload, workflow pipeline, LLM calls, ATS scorer, builder, AI chat, Chrome extension, Caddy HTTPS)

Fully independent module. Uses Node.js 22+ ESM, SQLite (not shared PostgreSQL), and a local LLM via OpenAI-compatible API. Start with `npm run dev` (or `start-dev.ps1`). Caddy handles TLS; dev mode runs on plain HTTP.

---

## Checkpoints

### 1. Server starts and GET / returns 200
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-resume\ResumeServer && node --input-type=module -e "
import http from 'http';
const req = http.get('http://localhost:3000/', (res) => {
  console.log('STATUS:', res.statusCode);
  if (res.statusCode >= 200 && res.statusCode < 500) { process.exit(0); } else { process.exit(1); }
});
req.on('error', () => { console.log('SERVER_NOT_RUNNING — start with npm run dev first'); process.exit(0); });
" 2>&1
```
**Pass**: `STATUS: 200` (or 301/302 redirect) — server is listening
**On fail**: Server not started; check `server/server.js` for port binding and `server/config/env.js` for `PORT` default

---

### 2. POST /api/auth/register + /api/auth/login — JWT issued
**Type**: manual
**Pass**: `POST /api/auth/register` with `{ email, password }` → 201 with `{ token }`; `POST /api/auth/login` with same credentials → 200 with a JWT valid for 30 days (decode and verify `exp` claim)
**On fail**: SQLite DB not initialised — run `node admin/scripts/setup.js` first; check `server/database/` for migration setup

---

### 3. POST /api/files/upload — PDF accepted and stored
**Type**: manual
**Pass**: Multipart POST to `/api/files/upload` with a PDF file → 201 with `{ fileId, name }`; file appears in the `UserData/` directory (or configured `FILE_STORE_PATH`)
**On fail**: `services/file-store.js` is failing — check write permissions on `UserData/`; check `text-extractor.js` for PDF parse errors

---

### 4. POST /api/workflow/run — all 6 steps complete
**Type**: manual
**Pass**: POST `/api/workflow/run` with a valid `resumeId` and `jobListingId` → workflow job queued; polling `GET /api/workflow/:jobId/status` eventually returns `{ status: "complete", steps: { analyze: "done", "draft-000": "done", "score-000": "done", "draft-001": "done", "score-001": "done", build: "done" } }`
**On fail**: Check `services/job-queue.js` for stalled jobs; check `services/llm-client.js` for LLM endpoint connectivity (`LLM_BASE_URL` env var); ATS scorer failure shows in `services/ats-scorer.js`

---

### 5. GET /api/workflow/:jobId/status — step-by-step progress
**Type**: manual
**Pass**: While workflow is running, polling returns intermediate states (`analyze: "running"`, etc.); no step regresses from `done` to `running`
**On fail**: `services/job-queue.js` is not persisting step state between polls — check the queue store mechanism (in-memory vs SQLite)

---

### 6. LLM connectivity check
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-resume\ResumeServer && node --input-type=module -e "
import { checkLLMHealth } from './server/services/llm-client.js';
checkLLMHealth().then(ok => {
  console.log(ok ? 'LLM_REACHABLE' : 'LLM_UNREACHABLE');
  process.exit(ok ? 0 : 1);
}).catch(err => { console.log('LLM_UNREACHABLE —', err.message); process.exit(1); });
" 2>&1
```
**Pass**: `LLM_REACHABLE`
**On fail**: `LLM_BASE_URL` not set or the local LLM service is not running; check `server/services/llm-settings.js` for the configured endpoint — fall back to `http://localhost:11434` (Ollama default)

---

### 7. ATS scorer returns numeric score for a sample input
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-resume\ResumeServer && node --input-type=module -e "
import { scoreResume } from './server/services/ats-scorer.js';
const score = await scoreResume('Software engineer with 5 years experience', 'Senior TypeScript developer role');
console.log('ATS_SCORE:', score);
if (typeof score !== 'number' || score < 0 || score > 100) { process.exit(1); }
" 2>&1
```
**Pass**: `ATS_SCORE: N` where `N` is 0–100
**On fail**: LLM not reachable; or the ATS scorer is making an LLM call — verify `ats-scorer.js` has a fallback for offline mode (regex/keyword matching)

---

### 8. Builder produces non-empty output document
**Type**: manual
**Pass**: After workflow completes, `GET /api/workflow/:jobId/output` returns a JSON document (or downloadable file) with non-empty `sections.experience` and `sections.summary` fields; no placeholder `[REPLACE ME]` strings in output
**On fail**: `services/builder.js` draft-001 step produced empty content — check the LLM prompt in `server/services/prompts/` for the build step

---

### 9. POST /api/aichat — response returned
**Type**: manual
**Pass**: POST `/api/aichat` with `{ message: "How should I describe a 5-year TypeScript role?" }` (with valid JWT) → 200 with `{ reply: "..." }` non-empty
**On fail**: LLM not reachable; or `routes/aichat.js` is not reading the `Authorization` header — check middleware chain

---

### 10. GET /api/extension/download — Chrome extension ZIP served
**Type**: manual
**Pass**: `GET /api/extension/download` (with valid JWT) → 200 with `Content-Type: application/zip`; ZIP is non-empty and contains `manifest.json`
**On fail**: `routes/extension.js` is looking for the extension files in a path that doesn't exist; check `chrome-extension/` directory is present and the route path matches

---

### 11. Chrome extension — LinkedIn page scrape
**Type**: manual-hardware
**Pass**: Extension loaded in Chrome (`chrome://extensions` → Load unpacked → `chrome-extension/`); navigate to a LinkedIn job listing; extension content script extracts job title and description into the extension's popup
**On fail**: Check `chrome-extension/content.js` selector — LinkedIn periodically updates DOM class names; check `background.js` message passing to popup

---

### 12. Caddy HTTPS + timeout guard (production config)
**Type**: manual-hardware
**Pass**: With `docker compose up`, `https://[configured domain]/` serves the app with a valid TLS cert (Let's Encrypt or local CA); requests that hang past 30s are killed by Caddy's `timeout` directive (verify in `Caddyfile`)
**On fail**: Check `Caddyfile` for `tls` and `request_body { max_size }` directives; check Caddy logs for ACME challenge failures
