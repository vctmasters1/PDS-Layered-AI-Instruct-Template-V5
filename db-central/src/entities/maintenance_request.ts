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

/**
 * MaintenanceRequest entity - tracks repair requests, work orders, and vendor coordination.
 */
@Entity("maintenance_requests")
export class MaintenanceRequest {
  // ── Request status enum ────────────────────────────────────────────────────
  static readonly Status = {
    SUBMITTED: "submitted",
    REVIEWED: "reviewed",
    QUEUED: "queued",
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
  } as const;

  // ── Priority enum ──────────────────────────────────────────────────────────
  static readonly Priority = {
    LOW: "low",
    NORMAL: "normal",
    HIGH: "high",
    EMERGENCY: "emergency",
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

  // ── Request details ────────────────────────────────────────────────────────
  @Column()
  title: string;

  @Column({ type: "text" })
  description: string;

  @Column({
    type: "simple-array",
    nullable: true,
  })
  photos: string[]; // S3 URLs

  // ── Categorization ────────────────────────────────────────────────────────
  @Column()
  category: string; // e.g., "plumbing", "electrical", "heating"

  @Column({ nullable: true })
  subcategory: string;

  // ── Priority and urgency ───────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: MaintenanceRequest.Priority,
    default: MaintenanceRequest.Priority.NORMAL,
  })
  priority: keyof typeof MaintenanceRequest.Priority;

  // ── Status tracking ────────────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: MaintenanceRequest.Status,
    default: MaintenanceRequest.Status.SUBMITTED,
  })
  status: keyof typeof MaintenanceRequest.Status;

  // ── Vendor/contractor assignment ───────────────────────────────────────────
  @Column({ nullable: true })
  assignedVendorId: string; // UUID reference to vendor table

  @Column({ type: "text", nullable: true })
  vendorNotes: string;

  // ── Timestamps for SLA tracking ────────────────────────────────────────────
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column("timestamp", { nullable: true })
  acknowledgedAt: Date; // When vendor acknowledges request

  @Column("timestamp", { nullable: true })
  startedAt: Date; // When work begins

  @Column("timestamp", { nullable: true })
  completedAt: Date;

  @Column({ type: "text", nullable: true })
  completionNotes: string;

  @DeleteDateColumn()
  deletedAt: Date | null;
}