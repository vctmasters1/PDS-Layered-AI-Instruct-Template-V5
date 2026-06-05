import 'module-alias/register'; // must be first — registers @db-central → DB-Central/dist
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment-specific .env file
if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: path.join(__dirname, "..", ".env.production") });
} else {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
}

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import AppDataSource from "./database";
import authRoutes from "./routes/auth.js";
import devicesRoutes from "./routes/devices.js";
import cloudRoutes from "./routes/cloud.js";
import {
  securityHeaders,
  apiLimiter,
  authLimiter,
  validateContentType,
  securityLogger,
  httpsRedirect,
} from "./middleware/security.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const NODE_ENV = process.env.NODE_ENV || "development";

const app = express();

// Trust Railway's reverse proxy for correct client IPs
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Security middleware
app.use(httpsRedirect);
app.use(securityHeaders);
app.use(securityLogger);
app.use(validateContentType);

// CORS — allow the main domain and local dev
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : NODE_ENV === "production"
    ? ["https://pipedreamsystems.com"]
    : undefined;

app.use(
  cors({
    origin: allowedOrigins || true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(apiLimiter);

// Serve device frontend static files (React app built by Vite into WEB-HMI/dist/)
import * as fs from "fs";
// __dirname at runtime = WEB-HMI/api/dist/  →  ../../dist = WEB-HMI/dist (Vite output)
const frontendPath = path.join(__dirname, "..", "..", "dist");
const frontendExists = fs.existsSync(frontendPath);
if (frontendExists) {
  console.log(`📂 Serving WEB-HMI frontend from: ${frontendPath}`);
  app.use(express.static(frontendPath));
} else {
  console.log(`⚠️  Frontend dist not found — run 'npm run build' in WEB-HMI/ to build the React app`);
}

// Health check
app.get("/health", async (_req, res) => {
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.query("SELECT 1");
      res.json({ status: "ok", service: "devices", database: "connected", timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: "degraded", service: "devices", database: "not initialized" });
    }
  } catch {
    res.status(503).json({ status: "degraded", service: "devices", database: "unreachable" });
  }
});

// Auth routes — login, logout, /me (tight rate limit applies before general limiter)
app.use("/v1/auth", authLimiter, authRoutes);

// Devices API — all routes under /v1/devices
app.use("/v1/devices", devicesRoutes);

import { verifyDeviceToken } from "./middleware/auth.js";

// Cloud subscription management
app.use("/v1/cloud", cloudRoutes);

// ── Firmware proxy ───────────────────────────────────────────────────────────
// Forward /v1/firmware/* to WEB-FwServer so the browser hits one origin.
// FW_SERVER_URL defaults to http://localhost:3002 in dev.
const FW_SERVER_URL = (process.env.FW_SERVER_URL || "http://localhost:3002").replace(/\/$/, "");

// Device-token-authenticated download — called by device firmware during OTA.
// Sits BEFORE the wildcard proxy so it intercepts this specific path.
// The device uses X-Device-Token (set by _ota_http_event_handler in firmware).
// Supports full path: /:board/:hwrev/:deviceType/:version/device-download
// Also supports legacy path: /:deviceType/:version/device-download (no board/hwrev)
app.get(
  "/v1/firmware/:p1/:p2/:p3/:version/device-download",
  verifyDeviceToken,
  async (req: express.Request, res: express.Response) => {
    const { p1, p2, p3, version } = req.params;
    // p1=board, p2=hwrev, p3=deviceType — full new-style path
    const target = `${FW_SERVER_URL}/v1/firmware/${p1}/${p2}/${p3}/${version}/download`;
    try {
      const https = await import("https");
      const http = await import("http");
      const { URL } = await import("url");
      const parsed = new URL(target);
      const transport = parsed.protocol === "https:" ? https : http;
      const proxyReq = (transport as any).request(
        { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: "GET", headers: { host: parsed.host } },
        (proxyRes: any) => {
          res.status(proxyRes.statusCode);
          Object.entries(proxyRes.headers).forEach(([k, v]) => { if (k !== "transfer-encoding") res.setHeader(k, v as any); });
          proxyRes.pipe(res);
        }
      );
      proxyReq.on("error", (e: Error) => res.status(502).json({ error: "Firmware server unreachable", detail: e.message }));
      proxyReq.end();
    } catch (e: any) {
      res.status(502).json({ error: "Firmware proxy error", detail: e.message });
    }
  }
);

app.use("/v1/firmware", async (req: express.Request, res: express.Response) => {
  const target = `${FW_SERVER_URL}/v1/firmware${req.path}${req.url.includes("?") ? "?" + req.url.split("?")[1] : ""}`;
  try {
    const https = await import("https");
    const http = await import("http");
    const { URL } = await import("url");

    const parsed = new URL(target);
    const isHttps = parsed.protocol === "https:";
    const transport = isHttps ? https : http;

    const headers: Record<string, string> = { ...(req.headers as any) };
    headers["host"] = parsed.host;
    // Forward auth token if present
    if (req.headers.authorization) headers["authorization"] = req.headers.authorization;

    const proxyReq = (transport as any).request(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: req.method, headers },
      (proxyRes: any) => {
        res.status(proxyRes.statusCode);
        Object.entries(proxyRes.headers).forEach(([k, v]) => { if (k !== "transfer-encoding") res.setHeader(k, v as any); });
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", (e: Error) => { res.status(502).json({ error: "Firmware server unreachable", detail: e.message }); });
    if (["POST", "PUT", "PATCH"].includes(req.method)) req.pipe(proxyReq);
    else proxyReq.end();
  } catch (e: any) {
    res.status(502).json({ error: "Firmware proxy error", detail: e.message });
  }
});

// SPA catch-all: all non-API paths serve the React app shell
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/v1/") || req.path.startsWith("/health")) {
    return next();
  }
  const indexHtml = path.join(frontendPath, "index.html");
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(503).json({ error: "Frontend not built — run npm run build in WEB-HMI/" });
  }
});

// 404 for unknown API routes
app.use("/v1/*", (_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Log unhandled rejections/exceptions before crashing so we can diagnose the cause
process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Promise Rejection:", reason);
  console.error("   at promise:", promise);
});
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
  process.exit(1);
});

// Start server and connect DB
AppDataSource.initialize()
  .then(async () => {
    if (NODE_ENV === "production") await AppDataSource.runMigrations();
    console.log("✅ Devices DB connected");
    app.listen(PORT, () => {
      console.log(`🚀 Devices service running on port ${PORT} (${NODE_ENV})`);
    });
  })
  .catch((err) => {
    console.error("❌ Devices DB connection failed:", err);
    process.exit(1);
  });
