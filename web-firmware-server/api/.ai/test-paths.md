# Test Paths — web-firmware-server/api

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 2 (OTA upload), PATH 5 (OTA device update)

Verifies firmware binary storage, retrieval, version management, and the internal-secret bypass used by the HMI proxy. Requires a running local instance or Railway preview environment.

---

## Checkpoints

### 1. Server starts without errors
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-firmware-server\api && npm run build 2>&1 && echo "BUILD_OK"
```
**Pass**: exits 0, `BUILD_OK` printed, no TypeScript errors
**On fail**: Check for type errors in `src/routes/firmware.ts` or `src/entities/firmware.ts`

---

### 2. GET /v1/firmware returns 401 without token
**Type**: auto
**Command**:
```shell
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/v1/firmware
```
**Pass**: returns `401`
**On fail**: `verifyToken` middleware is not applied to the list route — check `src/routes/firmware.ts` route registration

---

### 3. Upload firmware binary (admin token required)
**Type**: manual
**Pass**: POST `/v1/firmware` (multipart, admin JWT) with a test `.bin` file → 201 response, row in `firmware` table with correct `board`, `hwrev`, `deviceType`, `version`, `checksum`
**On fail**: Check `STORAGE_DIR` env var is set and writable; check `adminOnly` middleware is passing the admin JWT

---

### 4. GET firmware list filtered by board/hwrev/deviceType
**Type**: manual
**Pass**: GET `/v1/firmware?board=esp32c3_sm&hwrev=hwrev_001&deviceType=aero-ctrl` returns only matching rows in descending `releasedAt` order
**On fail**: Query builder `andWhere` clauses in the list route are not applying filters — inspect `routes/firmware.ts`

---

### 5. Download binary — authenticated user
**Type**: manual
**Pass**: GET `/v1/firmware/:board/:hwrev/:type/:version/download` with valid JWT streams the binary file with `Content-Type: application/octet-stream` and correct `Content-Length`
**On fail**: Check `STORAGE_DIR` path construction matches the upload path; check file exists on disk

---

### 6. Download binary — internal secret bypass (HMI proxy path)
**Type**: manual
**Pass**: GET download endpoint from `localhost` with `X-Internal-Secret: <FW_INTERNAL_SECRET>` and no JWT → 200 stream (not 401). Same request from a non-localhost origin without JWT → 401.
**On fail**: Localhost check in `firmware.ts` download handler is using wrong comparison — verify `req.ip` normalisation (Railway sets `trust proxy 1`)

---

### 7. Activate / deactivate firmware version
**Type**: manual
**Pass**: PATCH `/v1/firmware/:id/activate` (admin JWT) sets `active=true` on target row and sets `active=false` on all other rows with same `board/hwrev/deviceType`. GET `?activeOnly=true` returns only the newly activated row.
**On fail**: The activate route is not clearing previous active flags atomically — check for a transaction or an explicit `UPDATE … WHERE active=true`

---

### 8. Corrupted binary rejected on upload
**Type**: manual
**Pass**: SHA-256 checksum stored in DB matches `sha256sum` of the downloaded binary — bit-for-bit identical to what was uploaded
**On fail**: File was written incorrectly to disk or checksum computed before full write — check `createHash` usage in the upload handler

---

### 9. 50 MB file size limit enforced
**Type**: manual
**Pass**: Upload attempt with a file > 50 MB returns 413
**On fail**: `multer` `limits.fileSize` is not set or the value is wrong in `firmware.ts`
