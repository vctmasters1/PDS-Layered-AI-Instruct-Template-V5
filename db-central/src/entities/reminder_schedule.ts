import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
} from "typeorm";
import { Account } from "./account.js";

/**
 * ReminderSchedule entity - manages automated email/SMS reminders for leases, rent due dates, etc.
 */
@Entity("reminder_schedules")
export class ReminderSchedule {
  // ── Schedule type enum ─────────────────────────────────────────────────────
  static readonly Type = {
    LEASE_EXPIRY: "lease_expiry",
    RENT_DUE: "rent_due",
    MAINTENANCE_FOLLOWUP: "maintenance_followup",
    PAYMENT_REMINDER: "payment_reminder",
    INSPECTION_ANNOUNCE: "inspection_announce",
  } as const;

  // ── Recurrence pattern enum ────────────────────────────────────────────────
  static readonly Pattern = {
    ONCE: "once",           // Send once at specific time
    MONTHLY: "monthly",     // Recur every month
    WEEKLY: "weekly",       // Recur weekly
    DAILY: "daily",         // Daily for critical reminders
  } as const;

  // ── Delivery status enum ───────────────────────────────────────────────────
  static readonly Status = {
    ACTIVE: "active",
    PAUSED: "paused",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
  } as const;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Multi-tenancy anchor ───────────────────────────────────────────────────
  @Column({ nullable: false })
  accountId: string;

  // ── Relationship to Account ────────────────────────────────────────────────
  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  account: Account;

  // ── Schedule configuration ─────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: ReminderSchedule.Type,
    default: ReminderSchedule.Type.LEASE_EXPIRY,
  })
  type: keyof typeof ReminderSchedule.Type;

  @Column({
    type: "enum",
    enum: ReminderSchedule.Pattern,
    default: ReminderSchedule.Pattern.ONCE,
  })
  pattern: keyof typeof ReminderSchedule.Pattern;

  // ── Timing configuration ───────────────────────────────────────────────────
  @Column({ nullable: true }) // For ONCE pattern
  scheduledAtDate: string; // YYYY-MM-DD

  @Column({ nullable: true }) // For ONCE pattern
  scheduledAtTime: string; // HH:MM (24-hour format)

  // ── Recurring configuration ────────────────────────────────────────────────
  @Column("int", { default: 1 }) // Recur every N units
  recurringInterval: number;

  @Column({
    type: "enum",
    enum: ReminderSchedule.Pattern,
    nullable: true,
  })
  recurringUnit: keyof typeof ReminderSchedule.Pattern; // monthly, weekly

  // ── Trigger reference (which record triggers this reminder) ───────────────
  @Column({ nullable: true }) // For lease_expiry type
  leaseId: string;

  @Column({ nullable: true }) // For rent_due type
  transactionId: string; // Reference to a rent Transaction

  // ── Notification settings ──────────────────────────────────────────────────
  @Column({ default: false })
  sendEmail: boolean;

  @Column({ nullable: true })
  emailTemplateId: string; // Reference to email template

  @Column({ default: false })
  sendSms: boolean;

  @Column({ nullable: true })
  smsTemplateId: string; // Reference to SMS template

  // ── Status tracking ────────────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: ReminderSchedule.Status,
    default: ReminderSchedule.Status.ACTIVE,
  })
  status: keyof typeof ReminderSchedule.Status;

  @Column({ nullable: true })
  lastSentAt: Date;

  @Column("int", { default: 0 })
  totalSentCount: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}