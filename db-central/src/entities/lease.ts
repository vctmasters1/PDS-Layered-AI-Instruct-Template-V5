import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { Account } from "./account.js";
import { Property } from "./property.js";
import { Tenant } from "./tenant.js";

/**
 * Lease entity - represents a rental agreement between tenant and property.
 * Supports recurring rent schedules, lease terms, and occupancy rules.
 */
@Entity("leases")
export class Lease {
  // ── Lease status enum ──────────────────────────────────────────────────────
  static readonly Status = {
    DRAFT: "draft",
    ACTIVE: "active",
    EXPIRED: "expired",
    TERMINATED: "terminated",
    RENEWED: "renewed",
  } as const;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Multi-tenancy anchor ───────────────────────────────────────────────────
  @Column({ nullable: false })
  accountId: string;

  // ── Relationships ──────────────────────────────────────────────────────────
  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  account: Account;

  @ManyToOne(() => Property, { onDelete: "RESTRICT" })
  property: Property;

  @Column()
  propertyId: string;

  @ManyToOne(() => Tenant, { onDelete: "RESTRICT" })
  tenant: Tenant;

  @Column()
  tenantId: string;

  // ── Lease term information ─────────────────────────────────────────────────
  @Column({ type: "date" })
  startDate: Date;

  @Column({ type: "date", nullable: true })
  endDate: Date;

  @Column("int", { default: 12 }) // Default 12 months
  termMonths: number;

  @Column({
    type: "enum",
    enum: Lease.Status,
    default: Lease.Status.DRAFT,
  })
  status: keyof typeof Lease.Status;

  // ── Financial terms ────────────────────────────────────────────────────────
  @Column("decimal", { precision: 10, scale: 2 })
  monthlyRent: number;

  @Column("decimal", { precision: 10, scale: 2, default: 0 })
  securityDeposit: number;

  @Column({ type: "simple-array", nullable: true })
  lateFeeStructure: string[]; // e.g., ["5% after 5 days", "flat $25"]

  // ── Occupancy rules ────────────────────────────────────────────────────────
  @Column("int", { default: 1, nullable: false })
  maxOccupants: number;

  @Column({ type: "simple-array", nullable: true })
  allowedPets: string[]; // ["dogs", "cats"] or []

  @Column({ default: false })
  petsAllowed: boolean;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  petDeposit: number;

  // ── Utilities and services ─────────────────────────────────────────────────
  @Column({ default: false })
  includesWater: boolean;

  @Column({ default: false })
  includesTrash: boolean;

  @Column({ default: false })
  includesGarden: boolean;

  @Column({ type: "simple-array", nullable: true })
  utilitiesTenantPays: string[];

  // ── Lease documents ────────────────────────────────────────────────────────
  @Column({ type: "text", nullable: true })
  leaseAgreementUrl: string; // S3 URL

  @Column("timestamp", { nullable: true })
  signedAt: Date;

  @Column({ nullable: true })
  signedByTenantId: string;

  // ── Renewal tracking ───────────────────────────────────────────────────────
  @Column({ default: false })
  autoRenewalEnabled: boolean;

  @Column("int", { default: 60 }) // Days before expiry to notify
  renewalNoticeDays: number;

  // ── Status timestamps ──────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}