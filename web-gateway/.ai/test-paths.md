# Test Paths — web-gateway (Nginx)

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 7 — front door for all browser traffic; routes `/hmi/*` → HMI service, `/marketplace/*` → Marketplace service.

Template-based Nginx config (`nginx.conf.template`). Deployed as a Docker container on Railway. Four env vars required: `HMI_HOST`, `HMI_PORT`, `MKT_HOST`, `MKT_PORT`. The FwServer has no gateway route — it is accessed directly via its Railway URL with `X-Internal-Secret`.

---

## Checkpoints

### 1. nginx.conf.template passes nginx syntax check
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-gateway && docker run --rm -v "${PWD}/nginx.conf.template:/etc/nginx/nginx.conf" nginx:alpine nginx -t 2>&1
```
**Pass**: `nginx: configuration file /etc/nginx/nginx.conf syntax is ok` and `nginx: configuration file /etc/nginx/nginx.conf test is successful`
**On fail**: Syntax error in `nginx.conf.template` — note that `${VAR}` substitution placeholders are valid Nginx variable syntax so they should not cause parse errors; if they do, wrap substitution vars in quotes

---

### 2. Docker image builds
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-gateway && docker build -t pds-gateway-test . 2>&1 && echo "BUILD_OK"
```
**Pass**: `BUILD_OK` printed, image tagged `pds-gateway-test`
**On fail**: Check Dockerfile `envsubst` command — if the substitution variable list is incomplete, some `${VAR}` literals will pass through unsubstituted into the final nginx.conf

---

### 3. GET / → 302 redirect to /marketplace/
**Type**: manual
**Pass**: With gateway running locally (`docker run -e HMI_HOST=... -e HMI_PORT=... -e MKT_HOST=... -e MKT_PORT=... -p 8080:80 pds-gateway-test`), `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/` returns `302` and `Location` header contains `/marketplace/`
**On fail**: `nginx.conf.template` root redirect rule is missing or using `return 301` — should be `return 302`

---

### 4. GET /hmi/api/v1/auth/me proxied to HMI service
**Type**: manual
**Pass**: Request to `http://localhost:8080/hmi/api/v1/auth/me` (without JWT) reaches the HMI API and returns `401` (not a gateway 502/404)
**On fail**: Proxy `location /hmi/api/` block is not stripping the `/hmi/api` prefix before forwarding — check that `proxy_pass` ends with a trailing `/` and rewrite rule removes the prefix correctly

---

### 5. GET /marketplace/ proxied to Marketplace frontend
**Type**: manual
**Pass**: `curl -s http://localhost:8080/marketplace/` returns HTML containing the marketplace app's `<div id="root">` or equivalent root element
**On fail**: `proxy_pass` for `/marketplace/` is pointing to the wrong host/port; check `MKT_HOST`/`MKT_PORT` env vars match the marketplace frontend service (not the API)

---

### 6. WebSocket upgrade to /marketplace/api/socket.io succeeds
**Type**: manual
**Pass**: `wscat -c ws://localhost:8080/marketplace/api/socket.io/?EIO=4&transport=websocket` connects and receives the Socket.IO handshake packet within 2 seconds
**On fail**: `Upgrade` and `Connection` proxy headers are not set in the `/marketplace/api/` location block — they must be present for WebSocket upgrade to work; check `proxy_set_header Upgrade $http_upgrade` and `proxy_set_header Connection "upgrade"` are in the location block

---

### 7. GET /health → 200 (Railway health check)
**Type**: manual
**Pass**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health` returns `200`
**On fail**: `/health` location is missing from `nginx.conf.template` — add `location = /health { return 200 "ok"; add_header Content-Type text/plain; }`

---

### 8. HMI frontend VITE_API_PREFIX is set to /hmi/api
**Type**: auto
**Command**:
```shell
node -e "
const fs = require('fs');
// Check .env, .env.production, vite.config.ts for VITE_API_PREFIX
const files = [
  'k:/PDS-Master-001/web-hmi/.env',
  'k:/PDS-Master-001/web-hmi/.env.production',
  'k:/PDS-Master-001/web-hmi/vite.config.ts'
];
let found = false;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('VITE_API_PREFIX') || content.includes('/hmi/api')) {
    console.log('FOUND in', f.split('/').pop(), ':', content.match(/VITE_API_PREFIX[^\n]*/)?.[0] ?? '/hmi/api reference');
    found = true;
  }
}
if (!found) { console.error('WARN — VITE_API_PREFIX not found in any web-hmi config; frontend fetch calls may use relative /v1/* paths that bypass the gateway prefix'); }
else { console.log('OK'); }
"
```
**Pass**: Finds `VITE_API_PREFIX=/hmi/api` (or equivalent) in a config file
**On fail**: The HMI frontend makes API calls to `/v1/*` directly — these will 404 through the gateway which routes `/hmi/api/*` not `/v1/*`; add `VITE_API_PREFIX=/hmi/api` to `web-hmi/.env.production`
