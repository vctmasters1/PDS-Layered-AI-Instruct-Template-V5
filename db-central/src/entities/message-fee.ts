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
 * Per-message charge record.
 * Every user_message incurs a $1.00 fee on the SENDER unless a waiver exists.
 * Fees are accrued and billed at the end of each 24-hour period.
 *
 * Revenue split (after Stripe 2.9% + $0.30 = $0.33):
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

  @Column()
  messageId: string;

  @ManyToOne(() => Message, { onDelete: "CASCADE" })
  @JoinColumn({ name: "messageId" })
  message: Message;

  @Column()
  senderId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "senderId" })
  sender: User;

  @Column()
  recipientId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "recipientId" })
  recipient: User;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 1.0 })
  amount: number;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0.34 })
  platformShare: number;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0.33 })
  recipientShare: number;

  @Column({ default: false })
  waived: boolean;

  @Column({ nullable: true })
  billingPeriod: string;

  @Column({ default: false })
  billed: boolean;

  @Column({ nullable: true })
  billedAt: Date;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @CreateDateColumn()
  createdAt: Date;
}
