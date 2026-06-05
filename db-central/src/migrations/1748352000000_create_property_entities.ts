import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePropertyEntities1748352000000 implements MigrationInterface {
  name = "CreatePropertyEntities1748352000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── accounts table (property portal multi-tenancy root) ───────────────────
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" VARCHAR NOT NULL UNIQUE,
        "company_name" VARCHAR NOT NULL,
        "company_email" VARCHAR,
        "company_phone" VARCHAR,
        "company_address" TEXT,
        "company_city" VARCHAR,
        "company_state" VARCHAR,
        "company_zip_code" VARCHAR,
        "role" VARCHAR DEFAULT 'owner',
        "status" VARCHAR DEFAULT 'onboarding',
        "tenant_portal_enabled" BOOLEAN DEFAULT FALSE,
        "tenant_portal_url_slug" VARCHAR,
        "auto_rent_reminders_enabled" BOOLEAN DEFAULT FALSE,
        "rent_reminder_days_before" INT DEFAULT 5,
        "stripe_account_id" VARCHAR,
        "accepted_payment_methods" TEXT[],
        "default_accounting_basis" VARCHAR DEFAULT 'accrual',
        "accrual_to_cash_toggle_enabled" BOOLEAN DEFAULT FALSE,
        "storage_limit_mb" INT DEFAULT 500,
        "current_storage_usage_mb" INT DEFAULT 0,
        "total_properties" INT DEFAULT 0,
        "active_leases" INT DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by_user_id" VARCHAR
      )
    `);

    // ── properties table ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "properties" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" UUID NOT NULL,
        "name" VARCHAR NOT NULL,
        "description" TEXT,
        "external_id" VARCHAR UNIQUE,
        "address_street" VARCHAR NOT NULL,
        "address_city" VARCHAR NOT NULL,
        "address_state" VARCHAR NOT NULL,
        "address_zip_code" VARCHAR NOT NULL,
        "address_country" VARCHAR DEFAULT 'USA',
        "latitude" DECIMAL(10, 8),
        "longitude" DECIMAL(11, 8),
        "amenities" TEXT[],
        "unit_count" INT DEFAULT 0,
        "total_square_footage" DECIMAL(10, 2),
        "status" VARCHAR DEFAULT 'active',
        "public_listing" BOOLEAN DEFAULT FALSE,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP WITH TIME ZONE
      )
    `);

    // ── tenants table ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" UUID NOT NULL,
        "first_name" VARCHAR NOT NULL,
        "last_name" VARCHAR NOT NULL,
        "email" VARCHAR NOT NULL UNIQUE,
        "phone" VARCHAR,
        "emergency_contacts" TEXT[],
        "identity_verified" BOOLEAN DEFAULT FALSE,
        "ssn_last_4" VARCHAR,
        "monthly_income" DECIMAL(10, 2),
        "income_verified" BOOLEAN DEFAULT FALSE,
        "background_check_status" VARCHAR DEFAULT 'pending',
        "background_check_notes" VARCHAR,
        "status" VARCHAR DEFAULT 'active',
        "rating" DECIMAL(3, 2),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP WITH TIME ZONE
      )
    `);

    // ── leases table ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "leases" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" UUID NOT NULL,
        "property_id" UUID NOT NULL,
        "tenant_id" UUID NOT NULL,
        "start_date" DATE NOT NULL,
        "end_date" DATE,
        "term_months" INT DEFAULT 12,
        "status" VARCHAR DEFAULT 'draft',
        "monthly_rent" DECIMAL(10, 2) NOT NULL,
        "security_deposit" DECIMAL(10, 2) DEFAULT 0,
        "late_fee_structure" TEXT[],
        "max_occupants" INT NOT NULL DEFAULT 1,
        "allowed_pets" TEXT[],
        "pets_allowed" BOOLEAN DEFAULT FALSE,
        "pet_deposit" DECIMAL(10, 2),
        "includes_water" BOOLEAN DEFAULT FALSE,
        "includes_trash" BOOLEAN DEFAULT FALSE,
        "includes_garden" BOOLEAN DEFAULT FALSE,
        "utilities_tenant_pays" TEXT[],
        "lease_agreement_url" TEXT,
        "signed_at" TIMESTAMP WITH TIME ZONE,
        "signed_by_tenant_id" VARCHAR,
        "auto_renewal_enabled" BOOLEAN DEFAULT FALSE,
        "renewal_notice_days" INT DEFAULT 60,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP WITH TIME ZONE
      )
    `);

    // ── maintenance_requests table ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "maintenance_requests" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" UUID NOT NULL,
        "property_id" UUID,
        "tenant_id" UUID,
        "title" VARCHAR NOT NULL,
        "description" TEXT NOT NULL,
        "photos" TEXT[],
        "category" VARCHAR NOT NULL,
        "subcategory" VARCHAR,
        "priority" VARCHAR DEFAULT 'normal',
        "status" VARCHAR DEFAULT 'submitted',
        "assigned_vendor_id" VARCHAR,
        "vendor_notes" TEXT,
        "acknowledged_at" TIMESTAMP WITH TIME ZONE,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "completion_notes" TEXT,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP WITH TIME ZONE
      )
    `);

    // ── transactions table ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" UUID NOT NULL,
        "lease_id" UUID,
        "type" VARCHAR DEFAULT 'rent',
        "description" TEXT,
        "amount" DECIMAL(10, 2) NOT NULL,
        "tax_amount" DECIMAL(10, 2),
        "discount_amount" DECIMAL(10, 2) DEFAULT 0,
        "accounting_basis" VARCHAR DEFAULT 'accrual',
        "status" VARCHAR DEFAULT 'pending',
        "payment_method" VARCHAR,
        "transaction_reference" VARCHAR,
        "amount_paid" DECIMAL(10, 2),
        "posted_date" DATE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP WITH TIME ZONE
      )
    `);

    // ── documents table ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" UUID NOT NULL,
        "property_id" UUID,
        "tenant_id" UUID,
        "lease_id" UUID,
        "title" VARCHAR NOT NULL,
        "category" VARCHAR DEFAULT 'other',
        "description" TEXT,
        "s3_key" VARCHAR NOT NULL,
        "s3_bucket" VARCHAR NOT NULL,
        "content_type" VARCHAR NOT NULL,
        "file_size_bytes" INT NOT NULL,
        "visibility" VARCHAR DEFAULT 'private',
        "shared_with_tenant_id" VARCHAR,
        "uploaded_by_user_id" VARCHAR,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "deleted_at" TIMESTAMP WITH TIME ZONE
      )
    `);

    // ── reminder_schedules table ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "reminder_schedules" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" UUID NOT NULL,
        "type" VARCHAR DEFAULT 'lease_expiry',
        "pattern" VARCHAR DEFAULT 'once',
        "scheduled_at_date" VARCHAR,
        "scheduled_at_time" VARCHAR,
        "recurring_interval" INT DEFAULT 1,
        "recurring_unit" VARCHAR,
        "lease_id" VARCHAR,
        "transaction_id" VARCHAR,
        "send_email" BOOLEAN DEFAULT FALSE,
        "email_template_id" VARCHAR,
        "send_sms" BOOLEAN DEFAULT FALSE,
        "sms_template_id" VARCHAR,
        "status" VARCHAR DEFAULT 'active',
        "last_sent_at" TIMESTAMP WITH TIME ZONE,
        "total_sent_count" INT DEFAULT 0,
        "notes" TEXT,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP WITH TIME ZONE
      )
    `);

    // ── Add indexes for performance ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX idx_accounts_user_id ON accounts(user_id);
      CREATE INDEX idx_accounts_status ON accounts(status);
      CREATE INDEX idx_properties_account_id ON properties(account_id);
      CREATE INDEX idx_tenants_account_id ON tenants(account_id);
      CREATE INDEX idx_leases_account_id ON leases(account_id);
      CREATE INDEX idx_leases_property_id ON leases(property_id);
      CREATE INDEX idx_leases_tenant_id ON leases(tenant_id);
      CREATE INDEX idx_maintenance_requests_account_id ON maintenance_requests(account_id);
      CREATE INDEX idx_transactions_account_id ON transactions(account_id);
      CREATE INDEX idx_documents_account_id ON documents(account_id);
      CREATE INDEX idx_reminder_schedules_account_id ON reminder_schedules(account_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reminder_schedules"`);
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TABLE "maintenance_requests"`);
    await queryRunner.query(`DROP TABLE "leases"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
    await queryRunner.query(`DROP TABLE "properties"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
  }
}