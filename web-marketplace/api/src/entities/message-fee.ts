import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./user.js";
import { Message } from "./message.js";

/**
 * MessageFee — Per-message charge record.
 *
 * Every user_message incurs a $1.00 fee on the SENDER unless a waiver exists.
 * Fees are accrued and billed at the end of each 24-hour period.
 *
 * Revenue split (after Stripe processing fee of 2.9% + $0.30 = $0.33):
 *   Net = $0.67.  Platform = $0.34 (rounded up).  Recipient = $0.33.
 */
@Entity("message_fees")
@Index(["senderId"])
@Index(["recipientId"])
@Index(["billingPeriod"])
@Index(["billed"])
export class MessageFee {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** The message this fee is for */
  @Column()
  messageId: string;

  @ManyToOne(() => Message, { onDelete: "CASCADE" })
  @JoinColumn({ name: "messageId" })
  message: Message;

  /** Who sent the message (and owes the fee) */
  @Column()
  senderId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "senderId" })
  sender: User;

  /** Who received the message (gets 50 % of the fee) */
  @Column()
  recipientId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "recipientId" })
  recipient: User;

  /** Fee amount in dollars (default $1.00) */
  @Column({ type: "decimal", precision: 10, scale: 2, default: 1.0 })
  amount: number;

  /** Platform share — $0.34 after Stripe fee, rounded up */
  @Column({ type: "decimal", precision: 10, scale: 2, default: 0.34 })
  platformShare: number;

  /** Recipient share — $0.33 (remainder after Stripe + platform) */
  @Column({ type: "decimal", precision: 10, scale: 2, default: 0.33 })
  recipientShare: number;

  /** Whether a waiver was applied (fee = $0) */
  @Column({ default: false })
  waived: boolean;

  /** Billing period (YYYY-MM-DD date string for the 24-hr window) */
  @Column({ nullable: true })
  billingPeriod: string;

  /** Whether this fee has been billed / charged */
  @Column({ default: false })
  billed: boolean;

  /** When the fee was actually charged */
  @Column({ nullable: true })
  billedAt: Date;

  /** Stripe PaymentIntent ID from the charge */
  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @CreateDateColumn()
  createdAt: Date;
}
