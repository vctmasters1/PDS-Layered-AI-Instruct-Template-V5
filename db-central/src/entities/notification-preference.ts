import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.js";

@Entity("notification_preferences")
@Index(["userId"])
export class NotificationPreference {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ unique: true })
  userId: string;

  // In-app notification preferences
  @Column({ default: true })
  orderUpdates: boolean;

  @Column({ default: true })
  bidUpdates: boolean;

  @Column({ default: true })
  messages: boolean;

  @Column({ default: true })
  disputeUpdates: boolean;

  @Column({ default: true })
  paymentUpdates: boolean;

  @Column({ default: true })
  systemNotifications: boolean;

  // Email notification preferences
  @Column({ default: true })
  emailOrderUpdates: boolean;

  @Column({ default: false })
  emailBidUpdates: boolean;

  @Column({ default: false })
  emailMessages: boolean;

  @Column({ default: true })
  emailDisputeUpdates: boolean;

  @Column({ default: true })
  emailPaymentUpdates: boolean;

  @Column({ default: false })
  emailSystemNotifications: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
