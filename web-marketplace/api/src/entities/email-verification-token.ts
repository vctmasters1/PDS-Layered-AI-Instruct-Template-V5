import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * EmailVerificationToken — Database-backed email verification tokens.
 * 
 * Used during signup to verify email ownership BEFORE collecting payment info.
 * Stores a 6-digit code that the user enters to confirm their email.
 * 
 * Tokens are single-use and expire after 15 minutes.
 */
@Entity("email_verification_tokens")
@Index(["email"])
@Index(["expiresAt"])
export class EmailVerificationToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** The email address being verified */
  @Column()
  email: string;

  /** The 6-digit verification code */
  @Column()
  code: string;

  /** When the code expires (15 minutes from creation) */
  @Column()
  expiresAt: Date;

  /** Whether the code has been used (single-use) */
  @Column({ default: false })
  used: boolean;

  /** Whether verification was successful */
  @Column({ default: false })
  verified: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
