import "module-alias/register";
import "reflect-metadata";
import { DataSource } from "typeorm";
import {
  // Marketplace
  User, Designer, Producer, Product, Service, Order, OrderItem,
  Bid, PaymentMilestone, Dispute, BulletinCard, Message, MessageFee,
  MessagingFeeWaiver, Favorite, Invoice, Notification, NotificationPreference,
  Payout, PortfolioImage, Report, Review, Search, SiteSettings, WaitlistEntry,
  AuditLog, EmailVerificationToken, PasswordResetToken,
  // HMI / Device / Firmware
  Device, DeviceConfig, TelemetryLog, Firmware,
  // Property Portal
  Account, Property, Tenant, Lease, MaintenanceRequest, Transaction, Document, ReminderSchedule,
  PropertyOwner, ChartOfAccount, JournalEntry, JournalLine, UserViewPreference,
} from "@db-central/entities/index.js";

const isProduction = process.env.NODE_ENV === "production";

const allEntities = [
  User, Designer, Producer, Product, Service, Order, OrderItem,
  Bid, PaymentMilestone, Dispute, BulletinCard, Message, MessageFee,
  MessagingFeeWaiver, Favorite, Invoice, Notification, NotificationPreference,
  Payout, PortfolioImage, Report, Review, Search, SiteSettings, WaitlistEntry,
  AuditLog, EmailVerificationToken, PasswordResetToken,
  Device, DeviceConfig, TelemetryLog, Firmware,
  Account, Property, Tenant, Lease, MaintenanceRequest, Transaction, Document, ReminderSchedule,
  PropertyOwner, ChartOfAccount, JournalEntry, JournalLine, UserViewPreference,
];

const databaseUrl = process.env.DATABASE_URL;

let AppDataSource: DataSource;

if (databaseUrl) {
  console.log(`🗄️  Database: PostgreSQL via DATABASE_URL (${databaseUrl.substring(0, 30)}...)`);
  AppDataSource = new DataSource({
    type: "postgres",
    url: databaseUrl,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    synchronize: !isProduction,
    logging: false,
    entities: allEntities,
    extra: { max: 5 },
  });
} else {
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = parseInt(process.env.POSTGRES_PORT || "5432", 10);
  const user = process.env.POSTGRES_USER || "pds";
  const password = process.env.POSTGRES_PASSWORD || "pds_dev_password";
  const database = process.env.POSTGRES_DB || "pds_marketplace";

  console.log(`🗄️  Database: PostgreSQL @ ${host}:${port}/${database}`);
  AppDataSource = new DataSource({
    type: "postgres",
    host,
    port,
    username: user,
    password,
    database,
    ssl: false,
    synchronize: !isProduction,
    logging: false,
    entities: allEntities,
    extra: { max: 5 },
  });
}

export default AppDataSource;
