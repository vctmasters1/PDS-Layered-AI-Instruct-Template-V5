import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds all columns to `devices` that were created by TypeORM `synchronize`
 * in development but were never codified in a migration (schema drift fix).
 *
 * Also creates the `telemetry_logs` table, which was entirely missing from
 * production despite being present in dev via synchronize.
 *
 * Safe to run against an existing database — all ALTER TABLE statements use
 * ADD COLUMN IF NOT EXISTS; CREATE TABLE uses IF NOT EXISTS.
 */
export class AddDeviceColumnsAndTelemetry1741300000000 implements MigrationInterface {
  name = "AddDeviceColumnsAndTelemetry1741300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── devices — missing columns ────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "board"                character varying`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "hwrev"                character varying`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "role"                 character varying`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "displayName"          character varying`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "cloudEnabled"         boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "cloudSubscriptionId"  character varying`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "cloudPeriodEnd"       TIMESTAMP WITHOUT TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "deviceToken"          character varying`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "pendingSyncRequest"   boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "pendingPipeline"      text`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "pendingPipelineAt"    TIMESTAMP WITHOUT TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "currentPipeline"      text`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "pipelineMeta"         text`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "liveState"            text`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "pendingCommand"       text`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "pendingOtaVersion"    character varying`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "pendingOtaUrl"        character varying`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "autoUpdateEnabled"    boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "settingsSavedAt"      TIMESTAMP WITHOUT TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "settingsConfirmedAt"  TIMESTAMP WITHOUT TIME ZONE`);

    // deviceToken unique constraint — only add if column was just created
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_devices_deviceToken'
        ) THEN
          ALTER TABLE "devices" ADD CONSTRAINT "UQ_devices_deviceToken" UNIQUE ("deviceToken");
        END IF;
      END $$
    `);

    // ── telemetry_logs ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telemetry_logs" (
        "id"                   uuid    NOT NULL DEFAULT gen_random_uuid(),
        "deviceId"             uuid    NOT NULL,
        "deviceTimestampUnix"  bigint  NOT NULL,
        "deviceUptimeMs"       bigint  NOT NULL,
        "packetId"             integer NOT NULL DEFAULT 0,
        "statusFlags"          integer NOT NULL DEFAULT 0,
        "snapshot"             text    NOT NULL,
        "capturedAt"           TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_telemetry_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_telemetry_logs_deviceId"           ON "telemetry_logs" ("deviceId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_telemetry_logs_deviceId_capturedAt" ON "telemetry_logs" ("deviceId", "capturedAt")`);

    await queryRunner.query(`
      ALTER TABLE "telemetry_logs"
        ADD CONSTRAINT "FK_telemetry_logs_deviceId"
        FOREIGN KEY ("deviceId") REFERENCES "devices"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "telemetry_logs" DROP CONSTRAINT "FK_telemetry_logs_deviceId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "telemetry_logs"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "UQ_devices_deviceToken"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "settingsConfirmedAt"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "settingsSavedAt"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "autoUpdateEnabled"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "pendingOtaUrl"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "pendingOtaVersion"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "pendingCommand"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "liveState"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "pipelineMeta"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "currentPipeline"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "pendingPipelineAt"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "pendingPipeline"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "pendingSyncRequest"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "deviceToken"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "cloudPeriodEnd"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "cloudSubscriptionId"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "cloudEnabled"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "displayName"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "role"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "hwrev"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "board"`);
  }
}
