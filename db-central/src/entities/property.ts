import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Account } from "./account.js";
import { PropertyOwner } from "./property_owner.js";

export type PropertyType = "complex" | "building" | "unit";

/**
 * Property entity — self-referential hierarchy: complex → building → unit.
 * parentId = null means top-level (a complex, or a standalone building/unit).
 * Each unit-level property is the anchor for Lease and accounting entries.
 */
@Entity("properties")
export class Property {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Multi-tenancy anchor ───────────────────────────────────────────────────
  @Column({ nullable: false })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  account: Account;

  // ── Hierarchy ─────────────────────────────────────────────────────────────
  @Column({ default: "unit" })
  type: PropertyType; // 'complex' | 'building' | 'unit'

  @Column({ nullable: true })
  parentId: string | null; // null = top-level

  @ManyToOne(() => Property, (p) => p.children, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "parentId" })
  parent: Property | null;

  @OneToMany(() => Property, (p) => p.parent)
  children: Property[];

  // ── Ownership ─────────────────────────────────────────────────────────────
  @Column({ nullable: true })
  ownerId: string | null;

  @ManyToOne(() => PropertyOwner, { nullable: true, onDelete: "SET NULL" })
  owner: PropertyOwner | null;

  // ── Identity ──────────────────────────────────────────────────────────────
  @Column()
  name: string; // e.g. "Sunset Gardens", "Building A", "Unit 101"

  @Column({ nullable: true })
  unitNumber: string | null; // populated for type='unit'

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ unique: true, nullable: true })
  externalId: string; // External system reference

  // ── Address (meaningful at complex level; units inherit via parent) ────────
  @Column({ nullable: true })
  addressStreet: string;

  @Column({ nullable: true })
  addressCity: string;

  @Column({ nullable: true })
  addressState: string;

  @Column({ nullable: true })
  addressZipCode: string;

  @Column({ default: "USA" })
  addressCountry: string;

  @Column("decimal", { precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column("decimal", { precision: 11, scale: 8, nullable: true })
  longitude: number;

  // ── Unit-level physical details ────────────────────────────────────────────
  @Column({ nullable: true })
  bedrooms: number | null;

  @Column({ nullable: true })
  bathrooms: number | null; // supports half-baths as 0.5

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  squareFootage: number | null;

  // Asking/listed rent for this unit (contracted rent lives on Lease)
  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  askingRent: number | null;

  // ── Property-wide metadata ─────────────────────────────────────────────────
  @Column({ type: "simple-array", nullable: true })
  amenities: string[];

  @Column({ default: 0 })
  unitCount: number; // denormalized count for complex/building nodes

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  totalSquareFootage: number;

  // ── Status and visibility ──────────────────────────────────────────────────
  @Column({ default: "active" })
  status: string; // 'active' | 'inactive' | 'pending' | 'vacant' | 'occupied'

  @Column({ default: false })
  publicListing: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
