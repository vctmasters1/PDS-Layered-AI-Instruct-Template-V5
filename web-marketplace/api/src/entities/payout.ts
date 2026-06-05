import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.js";
import { Invoice } from "./invoice.js";

export enum PayoutStatus {
  PENDING = "pending",         // Created, waiting for hold period
  HELD = "held",               // In hold period (3-5 business days)
  PROCESSING = "processing",   // Hold expired, transfer initiated
  COMPLETED = "completed",     // Successfully transferred
  FAILED = "failed",           // Transfer failed
  CANCELLED = "cancelled",     // Admin or system cancelled
}

export enum PayoutType {
  MESSAGING_FEE_SHARE = "messaging_fee_share",   // 50% of messaging fee to recipient
  ORDER_COMMISSION = "order_commission",           // Producer/designer earnings after commission
  REFUND = "refund",                               // Refund to buyer
  DISPUTE_SETTLEMENT = "dispute_settlement",       // Dispute resolution payout
}

/**
 * Payout — Tracks money owed TO users (sellers, producers, message recipients).
 *
 * Every payout has a mandatory hold period (default 3-5 business days) before
 * funds are released via Stripe Connect transfer. This protects against
 * chargebacks and fraudulent activity.
 *
 * Lifecycle: PENDING → HELD → PROCESSING → COMPLETED
 *            PENDING → CANCELLED (if dispute/fraud detected)
 *            PROCESSING → FAILED (Stripe transfer error)
 */
@Entity("payouts")
@Index(["userId"])
@Index(["status"])
@Index(["type"])
@Index(["holdUntil"])
@Index(["stripeTransferId"])
export class Payout {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** User receiving this payout */
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column()
  userId: string;

  /** Gross amount before platform fee deduction */
  @Column("decimal", { precision: 10, scale: 2 })
  amount: number;

  /** Platform fee / commission deducted */
  @Column("decimal", { precision: 10, scale: 2, default: 0 })
  platformFee: number;

  /** Net amount user actually receives (amount - platformFee) */
  @Column("decimal", { precision: 10, scale: 2 })
  netAmount: number;

  @Column({
    type: "enum",
    enum: PayoutStatus,
    default: PayoutStatus.PENDING,
  })
  status: PayoutStatus;

  @Column({
    type: "enum",
    enum: PayoutType,
  })
  type: PayoutType;

  /**
   * Date when hold period expires and funds can be released.
   * Calculated as creation date + 3-5 business days.
   */
  @Column({ nullable: true })
  holdUntil: Date;

  /** When the hold was released and transfer initiated */
  @Column({ nullable: true })
  releasedAt: Date;

  /** When the transfer completed */
  @Column({ nullable: true })
  completedAt: Date;

  /** Stripe Transfer ID (set when transfer is initiated) */
  @Column({ nullable: true })
  stripeTransferId: string;

  /** Reference to the linked invoice */
  @ManyToOne(() => Invoice, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "invoiceId" })
  invoice: Invoice;

  @Column({ nullable: true })
  invoiceId: string;

  /** What entity generated this payout */
  @Column({ nullable: true })
  sourceEntityType: string; // "message_fee", "order", "dispute", etc.

  @Column({ nullable: true })
  sourceEntityId: string;

  /** Human-readable description */
  @Column({ type: "text", nullable: true })
  description: string;

  /** Failure reason if transfer fails */
  @Column({ type: "text", nullable: true })
  failureReason: string;

  /** Arbitrary key-value metadata */
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete: GAAP compliance — never hard-delete payouts
  @DeleteDateColumn()
  deletedAt: Date | null;
}

/**
 * Calculate holdUntil date: skip weekends (Sat/Sun) to get N business days.
 * Default hold period: 3 business days.
 */
export function calculateHoldUntil(fromDate: Date = new Date(), businessDays: number = 3): Date {
  const result = new Date(fromDate);
  let added = 0;
  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      // Not Saturday (6) or Sunday (0)
      added++;
    }
  }
  return result;
}
