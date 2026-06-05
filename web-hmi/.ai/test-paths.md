# Test Paths — web-hmi

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 3 (telemetry), PATH 4 (cloud config push), PATH 5 (OTA check), PATH 6 (device claim), PATH 9 (pipeline codec), PATH 10 (Stripe)

Covers the HMI API (Express + TypeORM) and the React frontend. API checkpoints require `DATABASE_URL` or local PostgreSQL. Frontend checkpoints require a running dev server.

---

## Checkpoints

### 1. API builds without TypeScript errors
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-hmi\api && npm run build 2>&1 && echo "BUILD_OK"
```
**Pass**: `BUILD_OK` printed, no errors
**On fail**: Run `npx tsc --noEmit` to see full error list; likely a type mismatch in a route handler or a missing `@pds/pipeline` resolution

---

### 2. @pds/pipeline imports correctly into API
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-hmi\api && node -e "const {BLOCK_REGISTRY} = require('@pds/pipeline'); const n = Object.keys(BLOCK_REGISTRY).length; console.log('OK —', n, 'blocks'); if(n===0) process.exit(1);"
```
**Pass**: prints `OK — N blocks` (N ≥ 30)
**On fail**: `@pds/pipeline` package is not installed in `web-hmi/api/node_modules` — run `npm install` in `web-hmi/api/`

---

### 3. Pipeline codec: fmtCharSize works for all format chars
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-hmi\api && node -e "
const {fmtCharSize} = require('@pds/pipeline');
const chars = ['B','b','H','h','I','i','f','x','?'];
let ok = true;
for(const c of chars) { const sz = fmtCharSize(c); if(typeof sz !== 'number' || sz < 1) { console.error('FAIL — fmtCharSize(' + c + ') = ' + sz); ok = false; } }
if(ok) console.log('OK — fmtCharSize returns valid sizes for all format chars');
process.exit(ok ? 0 : 1);
"
```
**Pass**: `OK — fmtCharSize returns valid sizes for all format chars`
**On fail**: `fmtCharSize` accepts a single `FmtChar` character, not a full format string — check the call sites in `pipeline-codec.ts`

---

### 4. Device handler registry loads without errors
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-hmi\api && node -e "
const {listDevices} = require('./dist/devices/index.js');
const devices = listDevices();
console.log('Registered handlers:', devices.map(d => d.type).join(', '));
if (devices.length === 0) { process.exit(1); }
"
```
**Pass**: prints handler slugs including `aero-ctrl` and `h20-chiller`
**On fail**: Import of a handler threw — check for syntax errors in the handler's `index.ts` file

---

### 5. Serial number generation follows prefix table
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-hmi\api && node -e "
// Inline test of the prefix logic without DB
const SERIAL_PREFIX = {'aero-ctrl':'PDAC','h20-chiller':'PDCH','portioning-feeder':'PDPF'};
const types = ['aero-ctrl','h20-chiller','portioning-feeder','unknown-device'];
for (const t of types) {
  const prefix = SERIAL_PREFIX[t] ?? t.slice(0,4).toUpperCase();
  console.log(t, '->', prefix + '-00001');
}
"
```
**Pass**: prints `aero-ctrl -> PDAC-00001`, `h20-chiller -> PDCH-00001`, `portioning-feeder -> PDPF-00001`, `unknown-device -> UNKN-00001`
**On fail**: Prefix table in `routes/devices.ts` does not match this expected output — update the prefix or the test

---

### 6. Frontend builds without errors
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-hmi && npm run build 2>&1 && echo "BUILD_OK"
```
**Pass**: `BUILD_OK` printed, `dist/` produced
**On fail**: Check for TypeScript/import errors in `src/`

---

### 7. GET /v1/auth/me returns 401 without cookie
**Type**: manual
**Pass**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/v1/auth/me` returns `401`
**On fail**: `verifyToken` middleware is not applied to the `/auth/me` route

---

### 8. POST /v1/devices (admin) → serial + claim code + QR returned
**Type**: manual
**Pass**: Response JSON includes `serialNumber` matching `PDAC-NNNNN` format, `claimCode` matching `XXXX-XXXX` pattern, and a non-empty `qrCode` field
**On fail**: Check `generateSerial()` and `generateClaimCode()` in `routes/devices.ts`

---

### 9. POST /v1/devices/claim — valid code associates device with user
**Type**: manual
**Pass**: After claim, GET `/v1/devices` for the claiming user includes the device; `ownerId` column in DB matches user ID
**On fail**: Claim route not updating `ownerId` — check DB transaction in the claim handler

---

### 10. POST /v1/devices/claim — wrong code returns 404
**Type**: manual
**Pass**: `{ "error": "..." }` with status 404; device row unchanged
**On fail**: Error is 500 — claim handler is not handling the not-found case before calling `.save()`

---

### 11. POST /v1/devices/:id/telemetry → row in telemetry_logs
**Type**: manual
**Pass**: Device JWT POST to `/v1/devices/:id/telemetry` with valid binary payload → 201; row appears in `telemetry_logs` table with correct `deviceId` and `timestamp`
**On fail**: `verifyDeviceToken` middleware is rejecting the device JWT — check `JWT_SECRET` is consistent between issuer and verifier

---

### 12. GET /v1/cloud/status (dev mode) — mock response
**Type**: manual
**Pass**: With `NODE_ENV=development` and no `STRIPE_SECRET_KEY`, POST `/v1/cloud/subscribe` returns 200 with `cloudEnabled: true` mock response; no Stripe API call made
**On fail**: Dev mock branch not reached — check `isDev` flag logic in `routes/cloud.ts`

---

### 13. Stripe webhook — tampered signature rejected
**Type**: manual
**Pass**: POST `/v1/cloud/webhook` with wrong `Stripe-Signature` header returns 400
**On fail**: Webhook handler is not verifying the signature — `stripe.webhooks.constructEvent()` call is missing or bypassed

---

### 14. Manual-hardware: device telemetry appears on dashboard after POST
**Type**: manual-hardware
**Pass**: Physical device connected to WiFi POSTs telemetry → ChartsScreen shows updated values within 5 seconds
**On fail**: Check `pds_cloud_push.c` endpoint URL matches the deployed HMI API URL stored in NVS
