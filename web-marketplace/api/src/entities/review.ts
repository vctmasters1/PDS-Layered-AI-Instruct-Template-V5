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
import { Order } from "./order.js";

/**
 * Review Entity — Two-Tier Rating System
 *
 * Tier 1 (Verified): Reviewer has a completed purchase/order for the target entity.
 *   - Weighted more heavily in aggregate ratings
 *   - Displayed with a "Verified Purchase" badge
 *
 * Tier 2 (Community): Reviewer has NOT purchased but can still leave a review.
 *   - Displayed with a "Community Review" badge
 *   - Weighted less in aggregate ratings
 *
 * Target types: 'product', 'designer', 'producer', 'service'
 */

@Entity("reviews")
@Index(["targetType", "targetId"]) // lookup by target
@Index(["reviewerId"]) // lookup by reviewer
@Index(["targetType", "targetId", "reviewerId"], { unique: true }) // one review per user per target
export class Review {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Who wrote the review
  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "reviewerId" })
  reviewer: User;

  @Column()
  reviewerId: string;

  // What is being reviewed
  @Column()
  targetType: string; // 'product' | 'designer' | 'producer' | 'service'

  @Column()
  targetId: string; // UUID of the product/designer/producer/service

  // Rating
  @Column({ type: "decimal", precision: 2, scale: 1 })
  rating: number; // 1.0 - 5.0 (half-star increments)

  @Column({ type: "text", nullable: true })
  title: string;

  @Column({ type: "text", nullable: true })
  body: string;

  // Two-tier verification
  @Column({ default: false })
  isVerifiedPurchase: boolean; // Tier 1: reviewer has a completed order

  @Column({ nullable: true })
  orderId: string; // The order that verifies this reviewer (nullable for community reviews)

  @ManyToOne(() => Order, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "orderId" })
  order: Order;

  // Moderation
  @Column({ default: true })
  visible: boolean; // Can be hidden by admin

  @Column({ nullable: true, type: "text" })
  moderationNote: string;

  // Helpfulness
  @Column({ default: 0 })
  helpfulCount: number; // "Was this helpful?" upvotes

  @Column({ type: "simple-json", nullable: true, default: "[]" })
  helpfulVoterIds: string[]; // User IDs who voted helpful (deduplication)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
