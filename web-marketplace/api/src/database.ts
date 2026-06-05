import "module-alias/register"; // registers @db-central → db-central/dist for TypeORM CLI
import { DataSource } from "typeorm";
import {
  User,
  Designer,
  Producer,
  Product,
  Order,
  OrderItem,
  Bid,
  SiteSettings,
  PaymentMilestone,
  Dispute,
  Message,
  Notification,
  NotificationPreference,
  SearchSavedSearch,
  Favorite,
  Service,
  AuditLog,
  Review,
  PasswordResetToken,
  EmailVerificationToken,
  MessageFee,
  MessagingFeeWaiver,
  BulletinCard,
  Report,
  Invoice,
  Payout,
  PortfolioImage,
  WaitlistEntry,
  MaterialListing,
} from "./entities/index.js";
// Device entities (Device, DeviceConfig, Firmware) have moved to the devices/ service.
// Their migrations have moved to WEB-HMI/api and WEB-FwServer/api respectively.

// PostgreSQL for ALL environments (dev, test, production)
const isProduction = process.env.NODE_ENV === "production";

const allEntities = [
  User, Designer, Producer, Product, Order, OrderItem, Bid,
  SiteSettings, PaymentMilestone, Dispute, Message, Notification,
  NotificationPreference, SearchSavedSearch, Favorite, Service,
  AuditLog, Review, PasswordResetToken, EmailVerificationToken,
  MessageFee, MessagingFeeWaiver, BulletinCard, Report,
  Invoice, Payout, PortfolioImage, WaitlistEntry, MaterialListing,
];

// Prefer DATABASE_URL, fall back to individual vars, then local dev defaults
const databaseUrl = process.env.DATABASE_URL;

let AppDataSource: DataSource;

if (databaseUrl) {
  console.log(`🗄️  Database: PostgreSQL via DATABASE_URL (${databaseUrl.substring(0, 30)}...)`);

  AppDataSource = new DataSource({
    type: "postgres",
    url: databaseUrl,
    ssl: isProduction ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' } : false,
    synchronize: false,
    logging: false,
    entities: allEntities,
    migrations: [__dirname + "/migrations/*.js"],
    subscribers: [],
    extra: { max: 5 },
  });
} else {
  // Individual connection variables — defaults are for local Docker dev
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
    ssl: isProduction ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' } : false,
    synchronize: false,
    logging: false,
    entities: allEntities,
    migrations: [__dirname + "/migrations/*.js"],
    subscribers: [],
    extra: { max: 5 },
  });
}

export default AppDataSource;
