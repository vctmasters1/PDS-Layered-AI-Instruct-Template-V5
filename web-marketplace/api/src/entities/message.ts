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

@Entity("messages")
@Index(["senderId"])
@Index(["recipientId"])
@Index(["conversationId"])
@Index(["createdAt"])
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Conversation grouping (optional - for threading)
  @Column({ nullable: true })
  conversationId: string; // Groups related messages

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "senderId" })
  sender: User;

  @Column({ nullable: true })
  senderId: string;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "recipientId" })
  recipient: User;

  @Column({ nullable: true })
  recipientId: string;

  // Message Content
  @Column("text")
  subject: string; // Message subject

  @Column("text")
  content: string; // Message body

  @Column({ nullable: true })
  relatedOrderId: string; // Optional: Link to order
  @Column({ nullable: true })
  relatedBidId: string; // Optional: Link to bid
  @Column({ nullable: true })
  relatedDisputeId: string; // Optional: Link to dispute

  // Status Tracking
  @Column({ default: false })
  read: boolean;

  @Column({ nullable: true })
  readAt: Date;

  @Column({ default: false })
  archived: boolean; // Sender-side archive

  @Column({ default: false })
  recipientArchived: boolean; // Recipient-side archive

  // Metadata
  @Column({ nullable: true, type: "jsonb" })
  attachmentUrls: string; // JSON array of attachment URLs

  @Column({ default: "user_message" })
  messageType: string; // "user_message", "system_notification", "order_update", etc.

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete: messages preserved for dispute resolution
  @DeleteDateColumn()
  deletedAt: Date | null;
}
