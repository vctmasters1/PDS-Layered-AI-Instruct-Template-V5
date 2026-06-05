import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./user.js";

/**
 * MessagingFeeWaiver — A designer / provider can waive messaging fees
 * for a specific user (buyer / party) for all FUTURE messages.
 *
 * Once a waiver is granted it applies indefinitely until revoked.
 * The waiver means: when the waived user sends messages TO the granter,
 * no fee is charged.
 */
@Entity("messaging_fee_waivers")
@Index(["grantedByUserId", "grantedToUserId"], { unique: true })
@Index(["grantedToUserId"])
export class MessagingFeeWaiver {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** The designer / provider who waives fees */
  @Column()
  grantedByUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "grantedByUserId" })
  grantedByUser: User;

  /** The user whose future messages are fee-free */
  @Column()
  grantedToUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "grantedToUserId" })
  grantedToUser: User;

  /** Whether the waiver is currently active */
  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  /** When the waiver was revoked (if ever) */
  @Column({ nullable: true })
  revokedAt: Date;
}
