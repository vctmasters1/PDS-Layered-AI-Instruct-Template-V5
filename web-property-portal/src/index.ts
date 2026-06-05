import "module-alias/register";
import "reflect-metadata";
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import AppDataSource from "./database.js";
import { propertiesRouter } from "./api/v1/properties.js";
import { tenantsRouter } from "./api/v1/tenants.js";
import { leasesRouter } from "./api/v1/leases.js";
import { maintenanceRouter } from "./api/v1/maintenance.js";
import { transactionsRouter } from "./api/v1/transactions.js";
import { documentsRouter } from "./api/v1/documents.js";
import { accountRouter } from "./api/v1/account.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3003", 10);

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "property-portal", timestamp: new Date().toISOString() });
});

app.use("/v1/properties", propertiesRouter);
app.use("/v1/tenants", tenantsRouter);
app.use("/v1/leases", leasesRouter);
app.use("/v1/maintenance", maintenanceRouter);
app.use("/v1/transactions", transactionsRouter);
app.use("/v1/documents", documentsRouter);
app.use("/v1/account", accountRouter);

// Placeholder for frontend — will serve React bundle when built
app.get("*", (_req, res) => {
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>PDS Property Portal</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:sans-serif;background:#f5f5f5}
.suite-bar{background:#f1f5f9;border-bottom:1px solid #e2e8f0;padding:5px 24px;font-size:12px;display:flex;align-items:center;gap:0}
.suite-bar .brand{font-weight:700;font-size:13px;color:#1a1a2e;text-decoration:none;margin-right:20px;letter-spacing:-0.01em}
.suite-bar a{color:#64748b;text-decoration:none;padding:2px 8px;border-radius:4px}
.suite-bar a:hover{color:#2563eb}
.suite-bar .active{color:#2563eb;font-weight:600;background:rgba(37,99,235,0.1)}
.suite-bar .sep{color:#cbd5e1;margin:0 6px}
.wrap{display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 30px)}
.card{background:#fff;padding:2rem 3rem;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);text-align:center}
h1{color:#1a1a2e;margin-bottom:.5rem}p{color:#666}
</style></head>
<body>
<div class="suite-bar">
  <a href="/marketplace/" class="brand">PipeDream Systems</a>
  <a href="/marketplace/">Marketplace</a>
  <span class="sep">|</span>
  <a href="/hmi/">Device Network</a>
  <span class="sep">|</span>
  <a href="/property/" class="active">Property Portal</a>
</div>
<div class="wrap"><div class="card"><h1>🏠 Property Portal</h1><p>API is running. Frontend coming soon.</p>
<p style="font-size:.8em;color:#999;margin-top:.5rem">GET /health for status</p></div></div>
</body></html>`);
});

AppDataSource.initialize()
  .then(() => {
    console.log("✅ Database connected");
    app.listen(PORT, () => {
      console.log(`🏠 Property Portal API running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  });
