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

export enum NotificationType {
  ORDER = "order",
  BID = "bid",
  MESSAGE = "message",
  DISPUTE = "dispute",
  PAYMENT = "payment",
  SYSTEM = "system",
  REVIEW = "review",
}

@Entity("notifications")
@Index(["userId"])
@Index(["read"])
@Index(["type"])
@Index(["createdAt"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column()
  userId: string;

  @Column({ type: "enum", enum: NotificationType })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: "text" })
  body: string;

  @Column({ nullable: true })
  link: string;

  @Column({ nullable: true })
  relatedId: string;

  @Column({ default: false })
  read: boolean;

  @Column({ nullable: true })
  readAt: Date;

  @Column({ default: false })
  emailSent: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
