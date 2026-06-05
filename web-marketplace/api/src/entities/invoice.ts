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

export enum InvoiceType {
  SIGNUP_FEE = "signup_fee",
  MESSAGING_FEE = "messaging_fee",
  BULLETIN_FEE = "bulletin_fee",
  LISTING_FEE = "listing_fee",
  ORDER_PAYMENT = "order_payment",
  MILESTONE_PAYMENT = "milestone_payment",
  PAYOUT = "payout",
  REFUND = "refund",
  COMMISSION = "commission",
}

export enum InvoiceStatus {
  DRAFT = "draft",
  PENDING = "pending",
  PAID = "paid",
  FAILED = "failed",
  REFUNDED = "refunded",
  CANCELLED = "cancelled",
}

/**
 * Invoice — Financial record for every monetary transaction on the platform.
 *
 * Every charge, payout, and refund gets an Invoice for GAAP-compliant
 * audit trails. Users can view their own invoices; admins can view all.
 */
@Entity("invoices")
@Index(["userId"])
@Index(["type"])
@Index(["status"])
@Index(["invoiceNumber"], { unique: true })
@Index(["stripePaymentIntentId"])
@Index(["issuedAt"])
export class Invoice {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** Auto-generated invoice number: INV-YYYYMMDD-XXXXX */
  @Column({ unique: true })
  invoiceNumber: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column()
  userId: string;

  @Column({
    type: "enum",
    enum: InvoiceType,
  })
  type: InvoiceType;

  @Column({
    type: "enum",
    enum: InvoiceStatus,
    default: InvoiceStatus.PENDING,
  })
  status: InvoiceStatus;

  /** Total amount (positive = charge to user, negative = credit/payout) */
  @Column("decimal", { precision: 10, scale: 2 })
  amount: number;

  /** Platform fee portion (commission, messaging share, etc.) */
  @Column("decimal", { precision: 10, scale: 2, default: 0 })
  platformFee: number;

  /** Net amount after platform fees */
  @Column("decimal", { precision: 10, scale: 2, default: 0 })
  netAmount: number;

  /** Stripe PaymentIntent ID (for charges) */
  @Column({ nullable: true })
  stripePaymentIntentId: string;

  /** Stripe Transfer ID (for payouts to connected accounts) */
  @Column({ nullable: true })
  stripeTransferId: string;

  /** Stripe Refund ID (for refund invoices) */
  @Column({ nullable: true })
  stripeRefundId: string;

  /** Human-readable description */
  @Column({ type: "text", nullable: true })
  description: string;

  /** Itemized line items (JSON array) */
  @Column({ type: "jsonb", nullable: true })
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];

  /** Reference to the source entity (e.g., orderId, messageFeeId) */
  @Column({ nullable: true })
  sourceEntityType: string;

  @Column({ nullable: true })
  sourceEntityId: string;

  @Column({ nullable: true })
  issuedAt: Date;

  @Column({ nullable: true })
  paidAt: Date;

  @Column({ nullable: true })
  dueDate: Date;

  /** Arbitrary key-value data for extensibility */
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete: GAAP compliance — never hard-delete invoices
  @DeleteDateColumn()
  deletedAt: Date | null;
}
