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

export enum ReviewStatus {
  PENDING = "pending",
  PUBLISHED = "published",
  REMOVED = "removed",
}

@Entity("reviews")
@Index(["reviewerId"])
@Index(["targetId"])
@Index(["targetType"])
@Index(["status"])
export class Review {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reviewerId" })
  reviewer: User;

  @Column({ nullable: true })
  reviewerId: string;

  @Column()
  targetType: string;

  @Column()
  targetId: string;

  @Column({ nullable: true })
  relatedOrderId: string;

  @Column({ nullable: true })
  relatedBidId: string;

  @Column({ type: "int" })
  rating: number;

  @Column({ nullable: true, type: "text" })
  comment: string;

  @Column({ default: false })
  verified: boolean;

  @Column({ type: "enum", enum: ReviewStatus, default: ReviewStatus.PENDING })
  status: ReviewStatus;

  @Column({ nullable: true })
  removedBy: string;

  @Column({ nullable: true })
  removedAt: Date;

  @Column({ nullable: true, type: "text" })
  removeReason: string;

  @Column({ default: false })
  adminHidden: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
