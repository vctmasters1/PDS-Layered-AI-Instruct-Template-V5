import { DataSource } from "typeorm";
import { User } from "./entities/user.js";
import { Device } from "./entities/device.js";
import { DeviceConfig } from "./entities/device-config.js";
import { Firmware } from "./entities/firmware.js";
import { TelemetryLog } from "./entities/telemetry-log.js";
// Import all db-central entities — TypeORM requires every entity referenced in
// a relation (e.g. User#designerProfile → Designer) to be registered in the DataSource.
import * as DbCentralEntities from "@db-central/entities/index.js";

// PostgreSQL — same database as the Marketplace service.
// Dev: synchronize creates tables automatically.
// Prod: synchronize is off; migrations run via AppDataSource.runMigrations() at startup.
const isProduction = process.env.NODE_ENV === "production";

// Spread all db-central entities into the DataSource so TypeORM can resolve
// cross-entity relations (e.g. User#designerProfile requires Designer registered).
// Cast to any[] because the index also exports enums; TypeORM ignores non-entity values.
const deviceEntities: any[] = [
  ...Object.values(DbCentralEntities),
  User, Device, DeviceConfig, Firmware, TelemetryLog,
];

const databaseUrl = process.env.DATABASE_URL;

let AppDataSource: DataSource;

if (databaseUrl) {
  console.log(`🗄️  Devices DB: PostgreSQL via DATABASE_URL (${databaseUrl.substring(0, 30)}...)`);

  AppDataSource = new DataSource({
    type: "postgres",
    url: databaseUrl,
    ssl: isProduction ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" } : false,
    synchronize: false,  // schema managed by DB-Central migrations only
    logging: false,
    entities: deviceEntities,
    migrations: [__dirname + "/migrations/*.js"],
    subscribers: [],
    extra: { max: 5 },
  });
} else {
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = parseInt(process.env.POSTGRES_PORT || "5432", 10);
  const user = process.env.POSTGRES_USER || "pds";
  const password = process.env.POSTGRES_PASSWORD || "pds_dev_password";
  const database = process.env.POSTGRES_DB || "pds_marketplace";

  console.log(`🗄️  Devices DB: PostgreSQL @ ${host}:${port}/${database}`);

  AppDataSource = new DataSource({
    type: "postgres",
    host,
    port,
    username: user,
    password,
    database,
    ssl: isProduction
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" }
      : false,
    synchronize: false,  // schema managed by DB-Central migrations only
    logging: false,
    entities: deviceEntities,
    migrations: [__dirname + "/migrations/*.js"],
    subscribers: [],
    extra: { max: 5 },
  });
}

export default AppDataSource;
