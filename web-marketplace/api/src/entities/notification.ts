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

export enum NotificationType {
  // Order Events
  ORDER_CREATED = "ORDER_CREATED",
  ORDER_CONFIRMED = "ORDER_CONFIRMED",
  ORDER_SHIPPED = "ORDER_SHIPPED",
  ORDER_DELIVERED = "ORDER_DELIVERED",
  ORDER_CANCELLED = "ORDER_CANCELLED",

  // Bid Events
  BID_RECEIVED = "BID_RECEIVED",
  BID_ACCEPTED = "BID_ACCEPTED",
  BID_REJECTED = "BID_REJECTED",
  BID_WITHDRAWN = "BID_WITHDRAWN",
  BID_EXPIRED = "BID_EXPIRED",

  // Payment Events
  PAYMENT_DUE = "PAYMENT_DUE",
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  PAYMENT_MILESTONE_RELEASED = "PAYMENT_MILESTONE_RELEASED",

  // Dispute Events
  DISPUTE_FILED = "DISPUTE_FILED",
  DISPUTE_RESOLVED = "DISPUTE_RESOLVED",
  DISPUTE_ESCALATED = "DISPUTE_ESCALATED",

  // Message Events
  MESSAGE_RECEIVED = "MESSAGE_RECEIVED",
  CONVERSATION_STARTED = "CONVERSATION_STARTED",

  // System Events
  PRODUCT_APPROVED = "PRODUCT_APPROVED",
  PRODUCT_REJECTED = "PRODUCT_REJECTED",
  ACCOUNT_VERIFIED = "ACCOUNT_VERIFIED",
}

@Entity("notifications")
@Index(["userId"])
@Index(["read"])
@Index(["type"])
@Index(["createdAt"])
@Index(["userId", "read"]) // Composite index for unread count
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column()
  userId: string;

  // Notification Content
  @Column({
    type: "enum",
    enum: NotificationType,
  })
  type: NotificationType;

  @Column("text")
  title: string; // Short notification title

  @Column("text")
  message: string; // Notification body/description

  // Badge text (optional, for quick summary)
  @Column({ nullable: true })
  badge: string; // e.g., "New bid", "Order shipped"

  // Link to related entity
  @Column({ nullable: true })
  relatedEntityId: string; // ID of related Order/Bid/Dispute/Product

  @Column({ nullable: true })
  relatedEntityType: string; // "order", "bid", "dispute", "product", "message"

  // Sender info (who triggered the notification)
  @Column({ nullable: true })
  senderId: string; // User who triggered the notification (if relevant)

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "senderId" })
  sender: User;

  // Status
  @Column({ default: false })
  read: boolean;

  @Column({ nullable: true })
  readAt: Date;

  @Column({ default: false })
  archived: boolean; // User can archive notifications

  // Action metadata (optional)
  @Column({ nullable: true })
  actionUrl: string; // Deep link to take action (e.g., "/orders/123")

  @Column({ nullable: true })
  actionLabel: string; // Label for action button (e.g., "Review Bid")

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
