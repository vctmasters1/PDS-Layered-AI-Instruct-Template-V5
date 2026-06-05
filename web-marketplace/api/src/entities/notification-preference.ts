import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.js";

@Entity("notification_preferences")
@Index(["userId"])
export class NotificationPreference {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column()
  userId: string;

  // Channel preferences
  @Column({ default: true })
  emailNotifications: boolean;

  @Column({ default: true })
  inAppNotifications: boolean;

  // Notification type toggles
  @Column({ default: true })
  orderNotifications: boolean; // All order-related events

  @Column({ default: true })
  bidNotifications: boolean; // All bid-related events

  @Column({ default: true })
  paymentNotifications: boolean; // All payment-related events

  @Column({ default: true })
  disputeNotifications: boolean; // All dispute-related events

  @Column({ default: true })
  messageNotifications: boolean; // Private message notifications

  @Column({ default: true })
  systemNotifications: boolean; // Product approvals, account verifications, etc.

  // Specific disable list (array of NotificationType enums we'd skip)
  @Column({ type: "simple-array", default: "" })
  disabledTypes: string[]; // e.g., ["BID_EXPIRED", "PAYMENT_DUE"]

  // Quiet hours
  @Column({ default: false })
  quietHoursEnabled: boolean;

  @Column({ nullable: true })
  quietHoursStart: string; // "22:00" format (24-hour)

  @Column({ nullable: true })
  quietHoursEnd: string; // "08:00" format (24-hour)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
