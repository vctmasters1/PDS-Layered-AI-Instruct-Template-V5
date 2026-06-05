/**
 * DB-Central migration runner.
 *
 * Usage:
 *   npm run migrate         — run all pending migrations
 *   npm run migrate:show    — show pending migration status (no-op run)
 *
 * Requires DATABASE_URL or individual PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD env vars.
 * Copy .env.example to .env or set vars in your shell before running.
 */

import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";

// All entities — keeps the DataSource in sync with all registered tables
import {
  User, Designer, Producer, Product, Service,
  Order, OrderItem, Bid, PaymentMilestone, Dispute,
  BulletinCard, Message, MessageFee, MessagingFeeWaiver, Favorite,
  Invoice, Notification, NotificationPreference, Payout, PortfolioImage,
  Report, Review, Search, SiteSettings, WaitlistEntry,
  AuditLog, EmailVerificationToken, PasswordResetToken,
  Device, DeviceConfig, TelemetryLog, Firmware,
} from "./src/entities/index.js";

import { migrations } from "./src/migrations/index.js";

function buildDataSource(): DataSource {
  if (process.env.DATABASE_URL) {
    return new DataSource({
      type: "postgres",
      url: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : false,
      entities: [
        User, Designer, Producer, Product, Service,
        Order, OrderItem, Bid, PaymentMilestone, Dispute,
        BulletinCard, Message, MessageFee, MessagingFeeWaiver, Favorite,
        Invoice, Notification, NotificationPreference, Payout, PortfolioImage,
        Report, Review, Search, SiteSettings, WaitlistEntry,
        AuditLog, EmailVerificationToken, PasswordResetToken,
        Device, DeviceConfig, TelemetryLog, Firmware,
      ],
      migrations,
      synchronize: false,
      logging: ["migration"],
    });
  }

  return new DataSource({
    type: "postgres",
    host: process.env.PGHOST ?? "localhost",
    port: parseInt(process.env.PGPORT ?? "5432", 10),
    database: process.env.PGDATABASE ?? "pds_marketplace",
    username: process.env.PGUSER ?? "pds",
    password: process.env.PGPASSWORD ?? "pds_dev_password",
    entities: [
      User, Designer, Producer, Product, Service,
      Order, OrderItem, Bid, PaymentMilestone, Dispute,
      BulletinCard, Message, MessageFee, MessagingFeeWaiver, Favorite,
      Invoice, Notification, NotificationPreference, Payout, PortfolioImage,
      Report, Review, Search, SiteSettings, WaitlistEntry,
      AuditLog, EmailVerificationToken, PasswordResetToken,
      Device, DeviceConfig, TelemetryLog, Firmware,
    ],
    migrations,
    synchronize: false,
    logging: ["migration"],
  });
}

async function main() {
  const showOnly = process.argv.includes("--show");
  const ds = buildDataSource();

  try {
    await ds.initialize();
    console.log("Connected to database.");

    if (showOnly) {
      const hasPending = await ds.showMigrations();
      if (!hasPending) {
        console.log("No pending migrations.");
      }
    } else {
      const ran = await ds.runMigrations({ transaction: "each" });
      if (ran.length === 0) {
        console.log("No pending migrations.");
      } else {
        console.log(`Ran ${ran.length} migration(s):`, ran.map((m) => m.name).join(", "));
      }
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
