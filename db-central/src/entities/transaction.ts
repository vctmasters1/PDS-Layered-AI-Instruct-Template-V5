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
import { Lease } from "./lease.js";

/**
 * Transaction entity - tracks rent payments, fees, deposits, and financial ledger entries.
 */
@Entity("transactions")
export class Transaction {
  // ── Transaction type enum ───────────────────────────────────────────────────
  static readonly Type = {
    RENT: "rent",
    SECURITY_DEPOSIT: "security_deposit",
    LATE_FEE: "late_fee",
    PET_FEE: "pet_fee",
    MAINTENANCE_COST: "maintenance_cost",
    REFUND: "refund",
    OTHER_INCOME: "other_income",
    OTHER_EXPENSE: "other_expense",
  } as const;

  // ── Transaction status enum ────────────────────────────────────────────────
  static readonly Status = {
    PENDING: "pending",
    COMPLETED: "completed",
    FAILED: "failed",
    REFUNDED: "refunded",
    CANCELLED: "cancelled",
  } as const;

  // ── Accounting basis enum ──────────────────────────────────────────────────
  static readonly Basis = {
    ACCRUAL: "accrual", // Record when earned/incurred
    CASH: "cash",       // Record when cash changes hands
  } as const;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Multi-tenancy anchor ───────────────────────────────────────────────────
  @Column({ nullable: false })
  accountId: string;

  // ── Relationships ──────────────────────────────────────────────────────────
  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  account: Account;

  @ManyToOne(() => Lease, { onDelete: "SET NULL" })
  lease: Lease;

  @Column({ nullable: true })
  leaseId: string;

  // ── Basic transaction info ─────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: Transaction.Type,
    default: Transaction.Type.RENT,
  })
  type: keyof typeof Transaction.Type;

  @Column({ type: "text", nullable: true })
  description: string;

  // ── Financial amounts ──────────────────────────────────────────────────────
  @Column("decimal", { precision: 10, scale: 2 })
  amount: number;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  taxAmount: number;

  @Column("decimal", { precision: 10, scale: 2, default: 0 })
  discountAmount: number;

  // ── Accounting basis (accrual vs cash) ─────────────────────────────────────
  @Column({
    type: "enum",
    enum: Transaction.Basis,
    default: Transaction.Basis.ACCRUAL,
  })
  accountingBasis: keyof typeof Transaction.Basis;

  // ── Status tracking ────────────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: Transaction.Status,
    default: Transaction.Status.PENDING,
  })
  status: keyof typeof Transaction.Status;

  // ── Payment details ────────────────────────────────────────────────────────
  @Column({ nullable: true })
  paymentMethod: string; // e.g., "stripe", "check", "cash"

  @Column({ nullable: true })
  transactionReference: string; // Stripe charge ID, check number, etc.

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  amountPaid: number; // Actual amount received

  // ── Dates ──────────────────────────────────────────────────────────────────
  @Column({ type: "date" })
  postedDate: Date; // When transaction is recorded in books

  @Column("timestamp", { default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}