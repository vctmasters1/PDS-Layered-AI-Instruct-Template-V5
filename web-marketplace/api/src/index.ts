import 'module-alias/register'; // must be first — registers @db-central → DB-Central/dist
import * as dotenv from "dotenv";
import * as path from "path";
import { createServer } from "http";

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
import authRoutes from "./routes/auth";
import bidsRoutes from "./routes/bids";
import ordersRoutes from "./routes/orders";
import productsRoutes from "./routes/products";
import producerQueueRoutes from "./routes/producer-queue.js";
import messagingRoutes from "./routes/messaging.js";
import notificationsRoutes from "./routes/notifications.js";
import adminRoutes from "./routes/admin.js";
import searchRoutes from "./routes/search.js";
import paymentsRoutes from "./routes/payments.js";
import uploadsRoutes from "./routes/uploads.js";
import reviewsRoutes from "./routes/reviews.js";
import bulletinBoardRoutes from "./routes/bulletin-board.js";
import reportsRoutes from "./routes/reports.js";
import invoicesRoutes from "./routes/invoices.js";
import payoutsRoutes from "./routes/payouts.js";
import portfolioRoutes from "./routes/portfolio.js";
import waitlistRoutes from "./routes/waitlist.js";
import creatorPostsRoutes from "./routes/creator-posts.js";
import materialListingsRoutes from "./routes/material-listings.js";
// Device routes have moved to the WEB-HMI/ service (WEB-HMI/api/src).
import { getGeoZipHandler } from "./services/geocode.js";
import { startBillingScheduler } from "./jobs/messaging-fee-billing.js";
import { startPayoutScheduler } from "./jobs/payout-processing.js";
import { initWebSocket } from "./services/websocket.js";
import {
  securityHeaders,
  apiLimiter,
  authLimiter,
  orderLimiter,
  validateContentType,
  securityLogger,
  httpsRedirect,
} from "./middleware/security.js";
import { testingAccessWhitelist } from "./middleware/accessControl.js";
import { validate, bootstrapAdminSchema } from "./middleware/validation.js";

// Initialize environment variables
const PORT = parseInt(process.env.PORT || "3000", 10);
const NODE_ENV = process.env.NODE_ENV || "development";

// Create Express app
const app = express();

// Trust Railway's reverse proxy for correct client IPs (rate limiting, logging)
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Security Middleware Stack
app.use(httpsRedirect); // Redirect HTTP to HTTPS in production
app.use(securityHeaders); // Apply helmet security headers
app.use(securityLogger); // Log suspicious patterns
app.use(validateContentType); // Enforce application/json

// Standard Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim())
  : process.env.NODE_ENV === "production"
    ? [
        "https://pipedreamsystems.com",
      ]
    : undefined; // undefined = allow all in development
app.use(cors({
  origin: allowedOrigins || true,
  credentials: true,
}));

// Stripe webhooks need raw body for signature verification — must come before express.json()
app.use("/v1/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate Limiting - Apply general API limiter globally
app.use(apiLimiter);

// Testing/Dev Access Control - Restrict access during testing phase
// Whitelist health, version, static frontend assets, and all API routes (JWT handles auth)
app.use(testingAccessWhitelist(["/health", "/v1/", "/", "/styles.css", "/css/", "/js/", "/app.js", "/main.js", "/socket.io/", "/assets/", "/uploads/", "/favicon"]));

// Serve frontend static files (CSS, JS, images)
// Prefer dist/ (Vite-built bundle) — falls back to source/ for Vite dev server
import * as fs from "fs";
const frontendDistPath = path.join(__dirname, "..", "..", "frontend", "dist");
const frontendSrcPath = path.join(__dirname, "..", "..", "frontend");
const frontendPath = fs.existsSync(frontendDistPath) ? frontendDistPath : frontendSrcPath;
console.log(`📂 Serving frontend from: ${frontendPath}`);
app.use(express.static(frontendPath));

// Serve uploaded images
const uploadsPath = path.join(__dirname, "..", "uploads");
app.use("/uploads", express.static(uploadsPath));

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.query("SELECT 1");
      res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: "degraded", database: "not initialized", timestamp: new Date().toISOString() });
    }
  } catch {
    res.status(503).json({ status: "degraded", database: "unreachable", timestamp: new Date().toISOString() });
  }
});

// API version endpoint
app.get("/v1/api/version", (req, res) => {
  res.json({ version: "1.0.0", name: "PDS Marketplace API" });
});

// One-time admin bootstrap (only works when no admin users exist)
app.post("/v1/bootstrap-admin", authLimiter, validate(bootstrapAdminSchema), async (req, res) => {
  try {
    const bcrypt = await import("bcrypt");
    const { v4: uuidv4 } = await import("uuid");
    const { User, UserRole } = await import("./entities/user.js");
    
    const userRepo = AppDataSource.getRepository(User);
    const adminCount = await userRepo.count({ where: { role: UserRole.ADMIN } });
    
    if (adminCount > 0) {
      return res.status(403).json({ error: "Admin already exists. Bootstrap disabled." });
    }
    
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    
    const hashedPassword = await bcrypt.default.hash(password, 10);
    const admin = userRepo.create({
      id: uuidv4(),
      email,
      password: hashedPassword,
      firstName: "Admin",
      lastName: "PipeDream",
      role: UserRole.ADMIN,
      isStaff: true,
      staffRole: "super_admin",
      emailVerified: true,
      active: true,
      verified: true,
      commissionRate: 0, // Admin doesn't sell — no commission
    });
    
    await userRepo.save(admin);
    res.status(201).json({ success: true, message: `Admin ${email} created`, id: admin.id });
  } catch (error: any) {
    console.error("Bootstrap admin error:", error);
    res.status(500).json({ error: "Failed to create admin account" });
  }
});

// Auth routes
app.use("/v1/auth", authLimiter, authRoutes);

// Products routes (designer product management)
app.use("/v1/products", productsRoutes);

// Orders routes (purchase flow, order management)
app.use("/v1/orders", orderLimiter, ordersRoutes);

// Bids routes (payment terms, acceptance, milestones, disputes)
app.use("/v1/bids", bidsRoutes);

// Producer Queue routes (available orders, bid submission, my bids)
app.use("/v1/producer-queue", producerQueueRoutes);

// Messaging routes (user-to-user communication)
app.use("/v1/messaging", messagingRoutes);

// Notifications routes (system events, preferences)
app.use("/v1/notifications", notificationsRoutes);

// Admin routes (marketplace management)
app.use("/v1/admin", adminRoutes);

// Search & Discovery routes (product search, recommendations, saved searches)
app.use("/v1/search", searchRoutes);

// Payments routes (Stripe integration)
app.use("/v1/payments", paymentsRoutes);

// Image uploads routes (with compression)
app.use("/v1/uploads", uploadsRoutes);

// Reviews routes (two-tier rating system)
app.use("/v1/reviews", reviewsRoutes);

// Bulletin Board routes (community cards, $1 posting fee)
app.use("/v1/bulletin-board", bulletinBoardRoutes);

// Reports routes (user reporting system)
app.use("/v1/reports", reportsRoutes);

// Invoices routes (financial records)
app.use("/v1/invoices", invoicesRoutes);

// Payouts routes (earnings, Stripe Connect)
app.use("/v1/payouts", payoutsRoutes);

// Portfolio routes (past project galleries)
app.use("/v1/portfolio", portfolioRoutes);
app.use("/v1/creator-posts", creatorPostsRoutes);
app.use("/v1/material-listings", materialListingsRoutes);

// Waitlist routes (notify user when out-of-stock product is available)
app.use("/v1/waitlist", waitlistRoutes);

// Device management routes have moved to the devices/ service.
// The proxy forwards pipedreamsystems.com/devices/* to that service.

// Geo utility (ZIP code → coordinates for distance calculations)
app.get("/v1/geo/zip/:zip", getGeoZipHandler());

// Marketplace routes — handled by /v1/search/designers and /v1/search/producers
// Legacy placeholder routes removed for production

// SPA catch-all: serve index.html for all frontend routes (must come after API routes)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/v1/") || req.path.startsWith("/uploads/")) {
    return next();
  }
  res.sendFile(path.join(frontendPath, "index.html"));
});

// 404 handler for undefined API routes
app.use("/v1/*", (req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global error handler — prevent stack traces in production
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log("🚀 Starting PDS Marketplace API...");
    console.log(`📍 Environment: ${NODE_ENV}`);

    // Initialize database connection
    console.log("📊 Initializing database connection...");
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log("✅ Database connected successfully");
    }

    // Schema management:
    // - DEV/TEST: synchronize() auto-creates/alters tables from entities
    // - PRODUCTION: Check if fresh DB, sync once, then use migrations only
    //   Set SYNC_SCHEMA=true to force a one-time schema sync (for adding new columns/tables)
    if (NODE_ENV !== "production") {
      console.log("🔄 Synchronizing database schema (dev only)...");
      await AppDataSource.synchronize();
      console.log("✅ Schema synchronized");
    } else {
      // One-time forced sync via env var (remove after schema is up to date)
      if (process.env.SYNC_SCHEMA === "true") {
        console.log("⚠️  SYNC_SCHEMA=true — synchronizing production schema...");
        await AppDataSource.synchronize();
        console.log("✅ Production schema synchronized (remove SYNC_SCHEMA env var now)");
      } else {
        // Detect fresh/reset database → one-time schema creation
        // Check for the 'user' entity table specifically because TypeORM creates
        // its own 'migrations' table during initialize(), which would fool a
        // generic "any table in public" check.
        const qr = AppDataSource.createQueryRunner();
        try {
          const tables = await qr.query(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'"
          );
          if (tables.length === 0) {
            console.log("📋 Entity tables missing — creating schema via synchronize...");
            await AppDataSource.synchronize();
            console.log("✅ Schema created");
          }
        } finally {
          await qr.release();
        }
      }
      console.log("📋 Running pending migrations...");
      await AppDataSource.runMigrations();
      console.log("✅ Migrations complete");
    }

    // One-time data fix: sync activeDesigner/activeProducer flags for users whose role indicates they should be active
    // Also geocode any users who have a ZIP but missing lat/lng
    try {
      const { User, UserRole } = await import("./entities/user.js");
      const { Designer } = await import("./entities/designer.js");
      const { Producer } = await import("./entities/producer.js");
      const { geocodeZip } = await import("./services/geocode.js");
      const userRepo = AppDataSource.getRepository(User);
      const designerRepo = AppDataSource.getRepository(Designer);
      const producerRepo = AppDataSource.getRepository(Producer);

      // Geocode users who have a ZIP but no coordinates
      const allUsers = await userRepo.find();
      for (const u of allUsers) {
        if (u.businessZip && (!u.businessLatitude || !u.businessLongitude)) {
          try {
            const geo = await geocodeZip(u.businessZip);
            if (geo) {
              u.businessLatitude = geo.lat;
              u.businessLongitude = geo.lng;
              if (!u.businessCity) u.businessCity = geo.city;
              if (!u.businessState) u.businessState = geo.state;
              await userRepo.save(u);

              // Also update any existing Designer/Producer profiles with the geocoded coords
              const designer = await designerRepo.findOne({ where: { user: { id: u.id } } });
              if (designer && (!designer.location_latitude || !designer.location_longitude)) {
                designer.location_latitude = geo.lat;
                designer.location_longitude = geo.lng;
                if (designer.location_city === "Unknown") designer.location_city = geo.city;
                if (designer.location_state === "Unknown") designer.location_state = geo.state;
                await designerRepo.save(designer);
              }
              const producer = await producerRepo.findOne({ where: { user: { id: u.id } } });
              if (producer && (!producer.location_latitude || !producer.location_longitude)) {
                producer.location_latitude = geo.lat;
                producer.location_longitude = geo.lng;
                if (producer.location_city === "Unknown") producer.location_city = geo.city;
                if (producer.location_state === "Unknown") producer.location_state = geo.state;
                await producerRepo.save(producer);
              }
              console.log(`  ✅ Geocoded ZIP ${u.businessZip} for user ${u.email}`);
            }
          } catch (geoErr: any) {
            console.warn(`  ⚠️ Geocode failed for ${u.email}:`, geoErr.message);
          }
        }
      }

      // Fix users with designer role but activeDesigner = false
      const designerUsers = await userRepo.find({ where: { role: UserRole.DESIGNER, activeDesigner: false } });
      for (const u of designerUsers) {
        try {
          u.activeDesigner = true;
          await userRepo.save(u);
          const existing = await designerRepo.findOne({ where: { user: { id: u.id } } });
          if (!existing) {
            const d = designerRepo.create({
              user: u,
              businessName: u.businessName || `${u.firstName} ${u.lastName}`.trim() || "My Design Studio",
              businessType: "creator" as any,
              location_address: "",
              location_city: u.businessCity || "Unknown",
              location_state: u.businessState || "Unknown",
              location_zipCode: u.businessZip || "00000",
              location_country: "USA",
              location_latitude: u.businessLatitude || 0,
              location_longitude: u.businessLongitude || 0,
              active: true,
            });
            await designerRepo.save(d);
          }
          console.log(`  ✅ Fixed designer flag & profile for user ${u.email}`);
        } catch (rowErr: any) {
          console.warn(`  ⚠️  Skipped designer fix for ${u.email}:`, rowErr.message);
        }
      }

      // Fix users with producer role but activeProducer = false
      const producerUsers = await userRepo.find({ where: { role: UserRole.PRODUCER, activeProducer: false } });
      for (const u of producerUsers) {
        try {
          u.activeProducer = true;
          await userRepo.save(u);
          const existing = await producerRepo.findOne({ where: { user: { id: u.id } } });
          if (!existing) {
            const p = producerRepo.create({
              user: u,
              businessName: u.businessName || `${u.firstName} ${u.lastName}`.trim() || "My Production Shop",
              location_address: "",
              location_city: u.businessCity || "Unknown",
              location_state: u.businessState || "Unknown",
              location_zipCode: u.businessZip || "00000",
              location_country: "USA",
              location_latitude: u.businessLatitude || 0,
              location_longitude: u.businessLongitude || 0,
              active: true,
            });
            await producerRepo.save(p);
          }
          console.log(`  ✅ Fixed producer flag & profile for user ${u.email}`);
        } catch (rowErr: any) {
          console.warn(`  ⚠️  Skipped producer fix for ${u.email}:`, rowErr.message);
        }
      }

      if (designerUsers.length || producerUsers.length) {
        console.log(`🔧 Fixed ${designerUsers.length} designer(s) and ${producerUsers.length} producer(s) with missing active flags`);
      }
    } catch (fixErr: any) {
      console.warn("⚠️  Active flag fix failed (non-fatal):", fixErr.message);
    }

    // Start scheduled jobs
    startBillingScheduler();
    startPayoutScheduler();

    // Create HTTP server and attach Socket.IO
    const httpServer = createServer(app);
    initWebSocket(httpServer);

    // Start listening
    httpServer.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🗄️  Database: ${process.env.POSTGRES_DB || "pds_marketplace"}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      httpServer.close(() => {
        console.log("HTTP server closed.");
      });
      try {
        if (AppDataSource.isInitialized) {
          await AppDataSource.destroy();
          console.log("Database connection closed.");
        }
      } catch (err) {
        console.error("Error closing database:", err);
      }
      process.exit(0);
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Unhandled rejection handler
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Start the server
startServer();

export default app;
