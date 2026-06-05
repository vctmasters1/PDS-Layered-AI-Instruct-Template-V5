import "dotenv/config";
import { DataSource } from "typeorm";
import { Firmware } from "./entities/firmware.js";

const isProd = process.env.NODE_ENV === "production";

export const AppDataSource = new DataSource(
  process.env.DATABASE_URL
    ? {
        type: "postgres",
        url: process.env.DATABASE_URL,
        ssl: isProd ? { rejectUnauthorized: false } : false,
        entities: [Firmware],
        synchronize: !isProd,
        migrations: [__dirname + "/migrations/*.js"],
        logging: false,
        extra: { max: 5 },
      }
    : {
        type: "postgres",
        host: process.env.POSTGRES_HOST || "localhost",
        port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
        username: process.env.POSTGRES_USER || "pds",
        password: process.env.POSTGRES_PASSWORD || "pds_dev_password",
        database: process.env.POSTGRES_DB || "pds_marketplace",
        entities: [Firmware],
        // In dev, auto-create the firmwares table if it doesn't exist
        synchronize: !isProd,
        migrations: [__dirname + "/migrations/*.js"],
        logging: false,
        extra: { max: 5 },
      }
);
