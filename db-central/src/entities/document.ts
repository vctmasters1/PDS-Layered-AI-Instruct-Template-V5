import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
} from "typeorm";
import { Account } from "./account.js";
import { Property } from "./property.js";
import { Tenant } from "./tenant.js";
import { Lease } from "./lease.js";

/**
 * Document entity - stores references to uploaded documents with S3 URLs.
 */
@Entity("documents")
export class Document {
  // ── Document category enum ─────────────────────────────────────────────────
  static readonly Category = {
    LEASE_AGREEMENT: "lease_agreement",
    RENTAL_APPLICATION: "rental_application",
    ID_PROOF: "id_proof",
    INCOME_PROOF: "income_proof",
    BACKGROUND_CHECK: "background_check",
    MAINTENANCE_REQUEST: "maintenance_request",
    PHOTOGRAPHY: "photography",
    OTHER: "other",
  } as const;

  // ── Document visibility enum ───────────────────────────────────────────────
  static readonly Visibility = {
    PRIVATE: "private",     // Viewable only by account owner
    TENANT_ONLY: "tenant",  // Viewable by tenant and account owner
    BOTH: "both",           // Viewable by both parties
  } as const;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Multi-tenancy anchor ───────────────────────────────────────────────────
  @Column({ nullable: false })
  accountId: string;

  // ── Relationships ──────────────────────────────────────────────────────────
  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  account: Account;

  @ManyToOne(() => Property, { onDelete: "SET NULL" })
  property: Property;

  @Column({ nullable: true })
  propertyId: string;

  @ManyToOne(() => Tenant, { onDelete: "SET NULL" })
  tenant: Tenant;

  @Column({ nullable: true })
  tenantId: string;

  @ManyToOne(() => Lease, { onDelete: "SET NULL" })
  lease: Lease;

  @Column({ nullable: true })
  leaseId: string;

  // ── Document metadata ──────────────────────────────────────────────────────
  @Column()
  title: string;

  @Column({
    type: "enum",
    enum: Document.Category,
    default: Document.Category.OTHER,
  })
  category: keyof typeof Document.Category;

  @Column({ nullable: true })
  description: string;

  // ── S3 file reference ──────────────────────────────────────────────────────
  @Column()
  s3Key: string; // e.g., "accounts/{accountId}/docs/{filename}"

  @Column()
  s3Bucket: string; // e.g., "pds-property-docs"

  @Column()
  contentType: string; // e.g., "application/pdf", "image/jpeg"

  @Column("int")
  fileSizeBytes: number;

  // ── Access control ─────────────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: Document.Visibility,
    default: Document.Visibility.PRIVATE,
  })
  visibility: keyof typeof Document.Visibility;

  @Column({ nullable: true })
  sharedWithTenantId: string; // If visibility = tenant

  // ── Metadata tracking ──────────────────────────────────────────────────────
  @Column({ nullable: true })
  uploadedByUserId: string;

  @Column("timestamp", { default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Optional expiration (for temporary documents)
  @Column("timestamp", { nullable: true })
  expiresAt: Date | null;

  @DeleteDateColumn()
  deletedAt: Date | null;
}