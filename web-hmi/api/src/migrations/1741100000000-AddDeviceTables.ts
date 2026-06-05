import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the `devices` and `device_configs` tables.
 * Owned by WEB-HMI/api. Moved from WEB-Marketplace/api — the shared TypeORM
 * migrations table already tracks this as applied, so it will not re-run.
 */
export class AddDeviceTables1741100000000 implements MigrationInterface {
  name = "AddDeviceTables1741100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "devices" (
        "id"               uuid                NOT NULL DEFAULT gen_random_uuid(),
        "deviceType"       character varying   NOT NULL,
        "serialNumber"     character varying   NOT NULL,
        "friendlyName"     character varying,
        "firmwareVersion"  character varying   NOT NULL DEFAULT '0.0.0',
        "currentConfig"    text,
        "pendingConfig"    text,
        "ownerId"          uuid,
        "claimCode"        character varying,
        "claimAttempts"    integer             NOT NULL DEFAULT 0,
        "claimLockedUntil" TIMESTAMP WITHOUT TIME ZONE,
        "claimedAt"        TIMESTAMP WITHOUT TIME ZONE,
        "active"           boolean             NOT NULL DEFAULT true,
        "createdAt"        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        "lastSeenAt"       TIMESTAMP WITHOUT TIME ZONE,
        CONSTRAINT "PK_devices" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "devices"
        ADD CONSTRAINT "UQ_devices_serialNumber" UNIQUE ("serialNumber")
    `);

    await queryRunner.query(`CREATE INDEX "IDX_devices_serialNumber" ON "devices" ("serialNumber")`);
    await queryRunner.query(`CREATE INDEX "IDX_devices_deviceType"   ON "devices" ("deviceType")`);
    await queryRunner.query(`CREATE INDEX "IDX_devices_ownerId"      ON "devices" ("ownerId")`);

    await queryRunner.query(`
      ALTER TABLE "devices"
        ADD CONSTRAINT "FK_devices_ownerId"
        FOREIGN KEY ("ownerId") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // ── device_configs ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_configs" (
        "id"              uuid                NOT NULL DEFAULT gen_random_uuid(),
        "deviceId"        uuid                NOT NULL,
        "firmwareVersion" character varying   NOT NULL,
        "config"          text                NOT NULL,
        "submittedBy"     character varying,
        "acknowledged"    boolean             NOT NULL DEFAULT false,
        "createdAt"       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_device_configs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_device_configs_deviceId"  ON "device_configs" ("deviceId")`);
    await queryRunner.query(`CREATE INDEX "IDX_device_configs_createdAt" ON "device_configs" ("createdAt")`);

    await queryRunner.query(`
      ALTER TABLE "device_configs"
        ADD CONSTRAINT "FK_device_configs_deviceId"
        FOREIGN KEY ("deviceId") REFERENCES "devices"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "device_configs" DROP CONSTRAINT "FK_device_configs_deviceId"`);
    await queryRunner.query(`DROP TABLE "device_configs"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP CONSTRAINT "FK_devices_ownerId"`);
    await queryRunner.query(`DROP TABLE "devices"`);
  }
}
