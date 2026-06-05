import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum MaterialCondition {
  NEW      = "new",
  SURPLUS  = "surplus",
  USED     = "used",
  RECLAIMED = "reclaimed",
}

@Entity("material_listings")
@Index(["userId"])
export class MaterialListing {
  @PrimaryColumn("uuid")
  id: string;

  // Owner (references User.id but no FK constraint — soft reference)
  @Column("uuid")
  userId: string;

  @Column({ length: 120 })
  title: string;

  @Column("text")
  description: string;

  // Comma-delimited list of material category labels (e.g. "Hardwood,Plywood")
  @Column("simple-array", { nullable: true })
  materialTypes: string[];

  @Column({ nullable: true, type: "text" })
  imageUrl: string | null;

  // Cost per unit
  @Column("decimal", { precision: 12, scale: 2, default: 0 })
  pricePerUnit: number;

  // Unit label shown next to price and amount (e.g. "kg", "ft", "sheet", "roll")
  @Column({ length: 30, default: "unit" })
  unit: string;

  @Column("decimal", { precision: 12, scale: 2, default: 0 })
  amountAvailable: number;

  // Estimated lead time in days
  @Column({ type: "int", default: 1 })
  leadTimeDays: number;

  @Column({
    type: "varchar",
    length: 20,
    default: MaterialCondition.NEW,
  })
  condition: MaterialCondition;

  // Free-form extra info (shipping notes, min order, etc.)
  @Column({ nullable: true, type: "text" })
  notes: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
