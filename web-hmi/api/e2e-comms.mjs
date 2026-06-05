/**
 * e2e-comms.mjs — End-to-end comms test for WEB-HMI cloud ↔ device flow
 *
 * Tests the full round-trip:
 *   Admin provisions device → user claims it → firmware-side telemetry/sync/pipeline/ack
 *
 * Usage:
 *   node WEB-HMI/api/e2e-comms.mjs
 *
 * Requires:
 *   - WEB-HMI API running at http://localhost:3001
 *   - Dev seed data applied (npm run seed:dev in WEB-HMI/api)
 *   - Dev credentials: dev@pds.local / PdsLocal!Dev1
 */

import http from "http";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.HMI_API_URL || "http://localhost:3001";
const ADMIN_EMAIL = "dev@pds.local";
const ADMIN_PASSWORD = "PdsLocal!Dev1";
const DEVICE_TYPE = "aero-ctrl";

// Minimal valid aero-ctrl config (v1.0.0)
// All params listed in config-schema.ts must be present — validator treats them all as required.
const SAMPLE_CONFIG = {
  cropTemplate: "none",
  mistEnabled: true,
  mistIntervalSeconds: 30,
  mistDurationSeconds: 5,
  lightOnHour: 6,
  lightOffHour: 22,
  phTarget: 6.0,
  phHysteresis: 0.3,
  pump1Product: "none",
  pump1DoseRate: 20,
  pump2Product: "none",
  pump2DoseRate: 10,
  pump3Product: "none",
  pump3DoseRate: 5,
  pump4Product: "none",
  pump4DoseRate: 0,
  waterChangeMode: "time",
  waterChangeIntervalDays: 7,
  waterChangeVolumeGallons: 20,
};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────
let _cookie = "";

function request(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(_cookie ? { Cookie: _cookie } : {}),
        ...extraHeaders,
      },
    };

    const req = http.request(options, (res) => {
      // Capture Set-Cookie (login flow)
      const setCookie = res.headers["set-cookie"];
      if (setCookie) {
        const token = setCookie
          .map((c) => c.split(";")[0])
          .find((c) => c.startsWith("pds_token="));
        if (token) _cookie = token;
      }

      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ status: res.status || res.statusCode, body: json, raw: data });
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test runner
// ─────────────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? `\n     → ${detail}` : ""}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test steps
// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\nPDS E2E Comms Test`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  section("1. Auth — login");

  const loginRes = await request("POST", "/v1/auth/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  assert("POST /v1/auth/login → 200", loginRes.status === 200, JSON.stringify(loginRes.body));
  assert("Returns user object", loginRes.body?.email === ADMIN_EMAIL);
  assert("JWT cookie set", !!_cookie);

  const meRes = await request("GET", "/v1/auth/me");
  assert("GET /v1/auth/me → 200", meRes.status === 200);
  assert("/me returns correct user", meRes.body?.email === ADMIN_EMAIL);

  // ── 2. Admin provision ────────────────────────────────────────────────────
  section("2. Admin provision — create device record");

  const provRes = await request("POST", "/v1/devices/admin/provision", {
    deviceType: DEVICE_TYPE,
  });
  assert("POST /v1/devices/admin/provision → 201", provRes.status === 201, JSON.stringify(provRes.body));
  assert("Returns serialNumber", !!provRes.body?.serialNumber);
  assert("Returns claimCode", !!provRes.body?.claimCode);
  assert("Returns device id", !!provRes.body?.id);

  const { id: provId, serialNumber, claimCode } = provRes.body;
  console.log(`     serial: ${serialNumber}  claimCode: ${claimCode}`);

  // ── 3. Register (claim) device ────────────────────────────────────────────
  section("3. Register — user claims device");

  const regRes = await request("POST", "/v1/devices/register", {
    serialNumber,
    claimCode,
    friendlyName: "E2E Test Tower",
  });
  assert("POST /v1/devices/register → 200", regRes.status === 200, JSON.stringify(regRes.body));
  assert("Returns deviceToken (for NVS)", !!regRes.body?.deviceToken);
  assert("Returns device id", !!regRes.body?.id);

  const deviceId = regRes.body.id;
  const deviceToken = regRes.body.deviceToken;
  console.log(`     deviceId: ${deviceId}`);
  console.log(`     deviceToken: ${deviceToken.slice(0, 16)}...`);

  const deviceHeaders = { "X-Device-Token": deviceToken };

  // ── 4. Verify device in /mine ─────────────────────────────────────────────
  section("4. GET /devices/mine — device appears in user's list");

  const mineRes = await request("GET", "/v1/devices/mine");
  assert("GET /v1/devices/mine → 200", mineRes.status === 200);
  const myDevice = Array.isArray(mineRes.body) && mineRes.body.find((d) => d.id === deviceId);
  assert("Registered device in list", !!myDevice, `ids: ${JSON.stringify(mineRes.body?.map((d) => d.id))}`);
  assert("FriendlyName saved", myDevice?.friendlyName === "E2E Test Tower");

  // ── 5. Push config ────────────────────────────────────────────────────────
  section("5. POST /devices/:id/config — push pending config");

  const cfgRes = await request("POST", `/v1/devices/${deviceId}/config`, SAMPLE_CONFIG);
  assert("POST /devices/:id/config → 200", cfgRes.status === 200, JSON.stringify(cfgRes.body));
  assert("Config accepted", cfgRes.body?.message?.includes("pending") || cfgRes.body?.id != null || cfgRes.status === 200);

  // ── 6. Device telemetry (firmware side) ──────────────────────────────────
  section("6. POST /devices/:id/telemetry — firmware posts a snapshot");

  const telRes = await request(
    "POST",
    `/v1/devices/${deviceId}/telemetry`,
    {
      deviceTimestampUnix: Math.floor(Date.now() / 1000),
      deviceUptimeMs: 42000,
      packetId: 1,
      statusFlags: 0,
      snapshot: {
        mistCycleActive: false,
        lightOn: true,
        phValue: 6.1,
        waterTemp: 21.5,
        pump1Active: false,
        pump2Active: false,
        pump3Active: false,
        pump4Active: false,
      },
    },
    deviceHeaders
  );
  assert("POST /devices/:id/telemetry → 200 or 201", telRes.status === 200 || telRes.status === 201, JSON.stringify(telRes.body));

  // ── 7. Read telemetry back (user side) ────────────────────────────────────
  section("7. GET /devices/:id/telemetry — telemetry row visible");

  const getTelRes = await request("GET", `/v1/devices/${deviceId}/telemetry`);
  assert("GET /devices/:id/telemetry → 200", getTelRes.status === 200);
  const rows = Array.isArray(getTelRes.body) ? getTelRes.body : getTelRes.body?.rows || [];
  assert("At least one telemetry row", rows.length >= 1, `rows: ${rows.length}`);

  // ── 8. Sync request ───────────────────────────────────────────────────────
  section("8. POST /devices/:id/sync-request — user requests sync");

  const syncReqRes = await request("POST", `/v1/devices/${deviceId}/sync-request`);
  assert("POST /devices/:id/sync-request → 200", syncReqRes.status === 200, JSON.stringify(syncReqRes.body));

  // ── 9. Device polls pending-sync (firmware side) ──────────────────────────
  section("9. GET /devices/:id/pending-sync — firmware sees pending flag");

  const pendSyncRes = await request("GET", `/v1/devices/${deviceId}/pending-sync`, null, deviceHeaders);
  assert("GET /devices/:id/pending-sync → 200", pendSyncRes.status === 200, JSON.stringify(pendSyncRes.body));
  assert("pending flag is true", pendSyncRes.body?.pending === true, JSON.stringify(pendSyncRes.body));

  // Poll again — flag should be cleared
  const pendSyncRes2 = await request("GET", `/v1/devices/${deviceId}/pending-sync`, null, deviceHeaders);
  assert("Second poll: pending flag cleared", pendSyncRes2.body?.pending === false, JSON.stringify(pendSyncRes2.body));

  // ── 10. Push pipeline bins ────────────────────────────────────────────────
  section("10. POST /devices/:id/pipeline — push L1/L2/L3 blobs");

  // Use the real pipeline bins from dist/ if available, otherwise send 4-byte stubs
  let l1b64, l2b64, l3b64;
  try {
    const { readFileSync } = await import("fs");
    const root = new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    l1b64 = readFileSync(`${root}/PDS-BuildTools/dist/defaults/AERO-001/AERO-001_l1.bin`).toString("base64");
    l2b64 = readFileSync(`${root}/PDS-BuildTools/dist/defaults/AERO-001/AERO-001_l2.bin`).toString("base64");
    l3b64 = readFileSync(`${root}/PDS-BuildTools/dist/defaults/AERO-001/AERO-001_l3.bin`).toString("base64");
    console.log("     Using real AERO-001 pipeline bins");
  } catch {
    // Minimal 4-byte stub if bins aren't available
    const stub = Buffer.alloc(4).toString("base64");
    l1b64 = l2b64 = l3b64 = stub;
    console.log("     Warning: pipeline bins not found — using 4-byte stubs");
  }

  const pipeRes = await request("POST", `/v1/devices/${deviceId}/pipeline`, {
    l1: l1b64,
    l2: l2b64,
    l3: l3b64,
  });
  assert(
    "POST /devices/:id/pipeline → 200 or 201",
    pipeRes.status === 200 || pipeRes.status === 201,
    JSON.stringify(pipeRes.body)
  );

  // ── 11. Device polls pending-pipeline (firmware side) ────────────────────
  section("11. GET /devices/:id/pending-pipeline — firmware retrieves pipeline");

  const pendPipeRes = await request("GET", `/v1/devices/${deviceId}/pending-pipeline`, null, deviceHeaders);
  assert(
    "GET /devices/:id/pending-pipeline → 200 (binary) or 204 (none)",
    pendPipeRes.status === 200 || pendPipeRes.status === 204,
    `status: ${pendPipeRes.status}`
  );
  if (pendPipeRes.status === 200) {
    assert("Pipeline response has content", pendPipeRes.raw?.length > 0);
  }

  // ── 12. Device acks pipeline (firmware side) ──────────────────────────────
  section("12. POST /devices/:id/pipeline/ack — firmware confirms applied");

  const ackRes = await request("POST", `/v1/devices/${deviceId}/pipeline/ack`, { status: "ok" }, deviceHeaders);
  assert("POST /devices/:id/pipeline/ack → 200", ackRes.status === 200, JSON.stringify(ackRes.body));

  // Pipeline should now be cleared — poll should return 204
  const pendPipeRes2 = await request("GET", `/v1/devices/${deviceId}/pending-pipeline`, null, deviceHeaders);
  assert("After ack: pending-pipeline returns 204", pendPipeRes2.status === 204, `status: ${pendPipeRes2.status}`);

  // ── 13. Device-detail read ────────────────────────────────────────────────
  section("13. GET /devices/:id — device record readable");

  const devRes = await request("GET", `/v1/devices/${deviceId}`);
  assert("GET /devices/:id → 200", devRes.status === 200, JSON.stringify(devRes.body));
  assert("Device id matches", devRes.body?.id === deviceId);
  assert("Device type matches", devRes.body?.deviceType === DEVICE_TYPE);

  // ── 14. Cleanup — release device ─────────────────────────────────────────
  section("14. POST /devices/:id/release — cleanup");

  const releaseRes = await request("POST", `/v1/devices/${deviceId}/release`);
  assert("POST /devices/:id/release → 200", releaseRes.status === 200, JSON.stringify(releaseRes.body));

  // Device should no longer appear in /mine
  const mineAfter = await request("GET", "/v1/devices/mine");
  const stillOwned = Array.isArray(mineAfter.body) && mineAfter.body.find((d) => d.id === deviceId);
  assert("Device removed from /mine after release", !stillOwned);

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Result: ${passed}/${total} passed${failed > 0 ? `  (${failed} FAILED)` : "  ✓ ALL PASSED"}`);
  console.log(`${"═".repeat(64)}\n`);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("\nFatal error:", err.message || err);
  process.exit(1);
});
