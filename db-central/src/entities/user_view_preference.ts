import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  Unique,
} from "typeorm";
import { User } from "./user.js";

/**
 * UserViewPreference — persists per-user display settings for each named view.
 * Unique on (userId, viewKey) — one record per user per view.
 *
 * viewKey conventions:
 *   'property-portal.properties'   → property list
 *   'property-portal.units'        → unit list under a property
 *   'property-portal.tenants'      → tenant list
 *   'property-portal.leases'       → lease list
 *   'property-portal.ledger'       → journal entries
 */
@Entity("user_view_preferences")
@Unique(["userId", "viewKey"])
export class UserViewPreference {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user: User;

  @Column()
  viewKey: string;

  @Column({ default: "card" })
  displayMode: "card" | "table";

  // JSON array of { col: string, dir: 'asc' | 'desc' }
  @Column({ type: "simple-json", nullable: true })
  sortColumns: Array<{ col: string; dir: "asc" | "desc" }> | null;

  // JSON map of { [columnId]: boolean } — false hides the column
  @Column({ type: "simple-json", nullable: true })
  columnVisibility: Record<string, boolean> | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
