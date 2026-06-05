import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Account } from "./account.js";
import { PropertyOwner } from "./property_owner.js";
import { Property } from "./property.js";
import { Lease } from "./lease.js";
import { User } from "./user.js";
import { JournalLine } from "./journal_line.js";

export type JournalEntryStatus = "draft" | "posted" | "voided";

/**
 * JournalEntry — double-entry bookkeeping header.
 * All monetary movement in the property portal flows through here.
 *
 * Scoping (any combination; null = not restricted to that level):
 *   accountId  → always set (multi-tenancy anchor)
 *   ownerId    → filter by owner
 *   propertyId → filter by property / unit
 *   leaseId    → tied to a specific lease
 *
 * Constraint: sum of all JournalLine.debit must equal sum of all JournalLine.credit.
 * This invariant is enforced at the service layer, not the DB layer.
 */
@Entity("journal_entries")
export class JournalEntry {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Multi-tenancy anchor ───────────────────────────────────────────────────
  @Column()
  accountId: string;

  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  account: Account;

  // ── Optional scoping FKs ───────────────────────────────────────────────────
  @Column({ nullable: true })
  ownerId: string | null;

  @ManyToOne(() => PropertyOwner, { nullable: true, onDelete: "SET NULL" })
  owner: PropertyOwner | null;

  @Column({ nullable: true })
  propertyId: string | null;

  @ManyToOne(() => Property, { nullable: true, onDelete: "SET NULL" })
  property: Property | null;

  @Column({ nullable: true })
  leaseId: string | null;

  @ManyToOne(() => Lease, { nullable: true, onDelete: "SET NULL" })
  lease: Lease | null;

  // ── Entry metadata ─────────────────────────────────────────────────────────
  @Column({ type: "date" })
  entryDate: string; // ISO date string e.g. "2026-07-01"

  @Column()
  description: string;

  @Column({ nullable: true })
  reference: string | null; // Check #, invoice #, etc.

  @Column({ default: "draft" })
  status: JournalEntryStatus;

  // ── Audit trail ───────────────────────────────────────────────────────────
  @Column({ nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "createdById" })
  createdBy: User | null;

  @Column({ type: "timestamp", nullable: true })
  voidedAt: Date | null;

  @Column({ nullable: true })
  voidedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "voidedById" })
  voidedBy: User | null;

  @Column({ type: "text", nullable: true })
  voidReason: string | null;

  // ── Lines ─────────────────────────────────────────────────────────────────
  @OneToMany(() => JournalLine, (l) => l.journalEntry, { cascade: true })
  lines: JournalLine[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
