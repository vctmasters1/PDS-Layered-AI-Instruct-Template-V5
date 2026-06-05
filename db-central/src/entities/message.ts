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

  @Column({ nullable: true })
  conversationId: string;

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

  @Column("text")
  subject: string;

  @Column("text")
  content: string;

  @Column({ nullable: true })
  relatedOrderId: string;

  @Column({ nullable: true })
  relatedBidId: string;

  @Column({ nullable: true })
  relatedDisputeId: string;

  @Column({ default: false })
  read: boolean;

  @Column({ nullable: true })
  readAt: Date;

  @Column({ default: false })
  archived: boolean;

  @Column({ default: false })
  recipientArchived: boolean;

  @Column({ nullable: true, type: "jsonb" })
  attachmentUrls: string;

  @Column({ default: "user_message" })
  messageType: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
