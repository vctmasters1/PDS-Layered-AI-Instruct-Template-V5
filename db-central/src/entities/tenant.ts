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
import { User } from "./user.js";

export type TenantRequestStatus = "invited" | "pending_approval" | "approved" | "rejected";

/**
 * Tenant entity - represents a person leasing/renting space.
 * Two creation flows:
 *   1. Manager-initiated: manager creates Tenant → inviteToken emailed → Tenant creates User account
 *   2. Tenant self-request: tenant fills /property/request form (with optional propertyCode) →
 *      requestStatus = 'pending_approval' → manager approves → User account linked
 */
@Entity("tenants")
export class Tenant {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Multi-tenancy anchor ───────────────────────────────────────────────────
  @Column({ nullable: false })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  account: Account;

  // ── Linked portal login (null until account created and approved) ──────────
  @Column({ nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  user: User | null;

  // ── Basic tenant information ───────────────────────────────────────────────
  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: "simple-array", nullable: true })
  emergencyContacts: string[];

  // ── Identity verification ──────────────────────────────────────────────────
  @Column({ default: false })
  identityVerified: boolean;

  @Column({ nullable: true })
  ssnLast4: string;

  // ── Financial information ──────────────────────────────────────────────────
  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  monthlyIncome: number;

  @Column({ default: false })
  incomeVerified: boolean;

  // ── Background check status ────────────────────────────────────────────────
  @Column({ default: "pending" })
  backgroundCheckStatus: string; // 'pending' | 'passed' | 'flagged'

  @Column({ nullable: true })
  backgroundCheckNotes: string;

  // ── Self-request flow ─────────────────────────────────────────────────────
  // propertyCode: manager-issued code that pre-matches the tenant to a property
  @Column({ nullable: true })
  propertyCode: string | null;

  @Column({ default: "invited" })
  requestStatus: TenantRequestStatus;

  @Column({ type: "text", nullable: true })
  requestMessage: string | null; // Tenant's note on their self-request form

  @Column({ type: "timestamp", nullable: true })
  requestedAt: Date | null;

  // ── Manager-invite flow ───────────────────────────────────────────────────
  @Column({ nullable: true })
  inviteToken: string | null;

  @Column({ type: "timestamp", nullable: true })
  inviteExpiresAt: Date | null;

  // ── Status ─────────────────────────────────────────────────────────────────
  @Column({ default: "prospective" })
  status: string; // 'prospective' | 'active' | 'inactive' | 'moved_out'

  @Column("decimal", { precision: 3, scale: 2, nullable: true })
  rating: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
