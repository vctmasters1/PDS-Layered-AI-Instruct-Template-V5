import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from "typeorm";
import { JournalEntry } from "./journal_entry.js";
import { ChartOfAccount } from "./chart_of_account.js";

/**
 * JournalLine — one debit or credit row within a JournalEntry.
 *
 * Rules:
 *   - Exactly one of debit or credit must be non-null (set the other to null).
 *   - Across all lines in a JournalEntry: sum(debit) must equal sum(credit).
 *   - Service layer validates balance before setting status to 'posted'.
 */
@Entity("journal_lines")
export class JournalLine {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  journalEntryId: string;

  @ManyToOne(() => JournalEntry, (e) => e.lines, { onDelete: "CASCADE" })
  journalEntry: JournalEntry;

  @Column()
  chartAccountId: string;

  @ManyToOne(() => ChartOfAccount, { onDelete: "RESTRICT" })
  chartAccount: ChartOfAccount;

  // Exactly one side per line; the other should be null.
  @Column("decimal", { precision: 12, scale: 2, nullable: true })
  debit: number | null;

  @Column("decimal", { precision: 12, scale: 2, nullable: true })
  credit: number | null;

  @Column({ nullable: true })
  memo: string | null;

  @Column({ default: 0 })
  sortOrder: number; // Display order within the entry
}
