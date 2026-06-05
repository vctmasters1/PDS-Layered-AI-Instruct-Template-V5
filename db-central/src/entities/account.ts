import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./user.js";

/**
 * Account entity - extends User with property management capabilities.
 * This is the multi-tenancy root for pds-propertyportal module.
 */
@Entity("accounts")
export class Account {
  // ── Account role enum ──────────────────────────────────────────────────────
  static readonly Role = {
    OWNER: "owner",          // Full access to all properties and tenant data
    MANAGER: "manager",      // Can manage tenants but not financials
    VIEWER: "viewer",        // Read-only access
  } as const;

  // ── Account status enum ────────────────────────────────────────────────────
  static readonly Status = {
    ACTIVE: "active",
    INACTIVE: "inactive",
    SUSPENDED: "suspended",
    ONBOARDING: "onboarding",
  } as const;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Relationship to User ───────────────────────────────────────────────────
  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn()
  user: User;

  @Column({ unique: true })
  userId: string;

  // ── Organization information ───────────────────────────────────────────────
  @Column({ nullable: false })
  companyName: string;

  @Column({ nullable: true })
  companyEmail: string;

  @Column({ nullable: true })
  companyPhone: string;

  @Column({ type: "text", nullable: true })
  companyAddress: string;

  @Column({ nullable: true })
  companyCity: string;

  @Column({ nullable: true })
  companyState: string;

  @Column({ nullable: true })
  companyZipCode: string;

  // ── Account configuration ──────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: Account.Role,
    default: Account.Role.OWNER,
  })
  role: keyof typeof Account.Role;

  @Column({
    type: "enum",
    enum: Account.Status,
    default: Account.Status.ONBOARDING,
  })
  status: keyof typeof Account.Status;

  // ── Feature flags ──────────────────────────────────────────────────────────
  @Column({ default: false })
  tenantPortalEnabled: boolean; // Enable public tenant portal

  @Column({ nullable: true })
  tenantPortalUrlSlug: string; // Custom URL slug for tenant portal

  @Column({ default: false })
  autoRentRemindersEnabled: boolean;

  @Column("int", { default: 5 }) // Days before due date
  rentReminderDaysBefore: number;

  // ── Payment configuration ──────────────────────────────────────────────────
  @Column({ nullable: true })
  stripeAccountId: string; // Connected Stripe account for property owner

  @Column({ type: "simple-array", nullable: true })
  acceptedPaymentMethods: string[]; // e.g., ["stripe", "check", "cash"]

  // ── Reporting preferences ──────────────────────────────────────────────────
  @Column({
    default: "accrual",
  }) // Default accounting basis
  defaultAccountingBasis: string;

  @Column({ default: false })
  accrualToCashToggleEnabled: boolean; // Allow UI toggle

  // ── Storage limits (AWS S3) ───────────────────────────────────────────────
  @Column("int", { default: 500 }) // MB limit
  storageLimitMB: number;

  @Column({ default: 0 })
  currentStorageUsageMB: number;

  // ── Usage tracking ─────────────────────────────────────────────────────────
  @Column("int", { default: 0 })
  totalProperties: number;

  @Column("int", { default: 0 })
  activeLeases: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ── Audit fields ───────────────────────────────────────────────────────────
  @DeleteDateColumn()
  deletedAt: Date | null;

  @Column({ nullable: true })
  deletedByUserId: string; // Admin ID who soft-deleted this account
}