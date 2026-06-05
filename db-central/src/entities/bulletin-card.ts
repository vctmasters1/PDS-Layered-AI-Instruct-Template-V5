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

  @Column({ type: "text" })
  myPipedream: string;

  @Column({ type: "text" })
  whatIHaveToOffer: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column("decimal", { precision: 10, scale: 2, default: 1.0 })
  postingFee: number;

  @Column({
    type: "enum",
    enum: BulletinCardStatus,
    default: BulletinCardStatus.PENDING_PAYMENT,
  })
  status: BulletinCardStatus;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  expiresAt: Date;
}
