import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { createServer } from "http";
import { AppDataSource } from "./database.js";
import { applySecurityMiddleware } from "./middleware/security.js";
import firmwareRouter from "./routes/firmware.js";

const PORT = parseInt(process.env.PORT || "3002", 10);

// Only WEB-HMI and the marketplace admin UI should talk to this service.
// In production, CORS_ORIGINS must be set (e.g. https://pipedreamsystems.com).
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : process.env.NODE_ENV === "production"
    ? ["https://pipedreamsystems.com"]
    : ["http://localhost:3001", "http://localhost:3000", "http://localhost:5173"];

const app = express();

applySecurityMiddleware(app);
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "devices-fw",
    database: AppDataSource.isInitialized ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/v1/firmware", firmwareRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function startServer(): Promise<void> {
  console.log(`🗄️  Firmware DB: PostgreSQL @ ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "pds_marketplace"}`);

  try {
    // Pre-sync cleanup: delete rows that would block adding NOT NULL columns.
    // This only runs in dev (synchronize=true). In production, migrations handle this.
    if (process.env.NODE_ENV !== "production") {
      const { Client } = await import("pg");
      const client = new Client(
        process.env.DATABASE_URL
          ? { connectionString: process.env.DATABASE_URL }
          : {
              host: process.env.POSTGRES_HOST || "localhost",
              port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
              user: process.env.POSTGRES_USER || "pds",
              password: process.env.POSTGRES_PASSWORD || "pds_dev_password",
              database: process.env.POSTGRES_DB || "pds_marketplace",
            }
      );
      try {
        await client.connect();
        // Add board/hwrev columns if missing (handles schema upgrades from pre-4-tuple era)
        await client.query(`
          ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS board VARCHAR;
          ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS hwrev VARCHAR;
        `).catch(() => {/* table may not exist yet — TypeORM will create it */});
        // Remove legacy rows missing required 4-tuple columns so TypeORM sync doesn't fail
        await client.query(`
          DELETE FROM firmwares
          WHERE board IS NULL OR hwrev IS NULL OR "deviceType" IS NULL OR version IS NULL
        `).catch(() => {/* ignore if columns still missing */});
        await client.end();
      } catch {
        // Table may not exist yet — that's fine, TypeORM will create it
      }
    }
    await AppDataSource.initialize();
    if (process.env.NODE_ENV === "production") await AppDataSource.runMigrations();
    console.log("✅ Firmware DB connected");
  } catch (err) {
    console.error("❌ DB connection failed:", err);
    process.exit(1);
  }

  const httpServer = createServer(app);
  httpServer.listen(PORT, () => {
    console.log(`🚀 Firmware service running on port ${PORT} (${process.env.NODE_ENV || "production"})`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📦 Firmware API:  http://localhost:${PORT}/v1/firmware`);
  });
}

startServer();
