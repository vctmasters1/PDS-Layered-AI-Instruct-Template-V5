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

export enum BulletinCardStatus {
  PENDING_PAYMENT = "pending_payment",
  ACTIVE = "active",
  EXPIRED = "expired",
  REMOVED = "removed",
}

@Entity("bulletin_cards")
@Index(["userId"])
@Index(["status"])
@Index(["createdAt"])
export class BulletinCard {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column()
  userId: string;

  // ── Card Content ──────────────────────────────────────────────────
  /** "My Pipedream" — what the poster dreams of / wants to find */
  @Column({ type: "text" })
  myPipedream: string;

  /** "What I Have to Offer" — skills, products, services the poster offers */
  @Column({ type: "text" })
  whatIHaveToOffer: string;

  /** Optional title / headline for the card */
  @Column({ nullable: true })
  title: string;

  // ── Payment ───────────────────────────────────────────────────────
  /** Stripe PaymentIntent ID for the $1 posting fee */
  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column("decimal", { precision: 10, scale: 2, default: 1.0 })
  postingFee: number;

  // ── Status ────────────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: BulletinCardStatus,
    default: BulletinCardStatus.PENDING_PAYMENT,
  })
  status: BulletinCardStatus;

  @Column({ default: true })
  active: boolean;

  // ── Timestamps ────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /** When the card expires (nullable = no expiry) */
  @Column({ nullable: true })
  expiresAt: Date;
}
