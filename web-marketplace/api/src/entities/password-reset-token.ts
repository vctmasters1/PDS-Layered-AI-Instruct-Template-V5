import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * PasswordResetToken — Database-backed password reset tokens.
 * 
 * Replaces the in-memory Map that was previously used. Tokens are stored in the
 * database so they survive server restarts and work across multiple instances.
 * 
 * Tokens are single-use and expire after 1 hour.
 */
@Entity("password_reset_tokens")
@Index(["token"], { unique: true })
@Index(["userId"])
@Index(["expiresAt"])
export class PasswordResetToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** The unique reset token (UUID) */
  @Column({ unique: true })
  token: string;

  /** The user this token belongs to */
  @Column()
  userId: string;

  /** When the token expires (1 hour from creation) */
  @Column()
  expiresAt: Date;

  /** Whether the token has been used (single-use) */
  @Column({ default: false })
  used: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
