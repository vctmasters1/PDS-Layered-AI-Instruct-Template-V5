import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.js";

export enum ServiceCategory {
  CONSULTING = "consulting",
  DESIGN = "design",
  MANUFACTURING = "manufacturing",
  LOGISTICS = "logistics",
  QUALITY_ASSURANCE = "quality_assurance",
  TRAINING = "training",
  REPAIR = "repair",
  CUSTOM = "custom",
}

@Entity("services")
@Index(["providerId"])
@Index(["category"])
@Index(["active"])
export class Service {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, (user) => user.providedServices, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "providerId" })
  provider: User;

  @Column()
  providerId: string;

  @Column()
  name: string;

  @Column({ type: "text" })
  description: string;

  @Column({ unique: true })
  sku: string;

  @Column("decimal", { precision: 10, scale: 2 })
  price: number;

  @Column({ nullable: true })
  priceType: string;

  @Column({ type: "text", nullable: true })
  serviceDetails: string;

  @Column()
  leadTime: number;

  @Column({ type: "simple-array", nullable: true })
  images: string[];

  @Column({
    type: "enum",
    enum: ServiceCategory,
    default: ServiceCategory.CUSTOM,
  })
  category: ServiceCategory;

  @Column({ default: true })
  active: boolean;

  @Column({ default: true })
  available: boolean;

  @Column({ default: 0 })
  bookingsInQueue: number;

  @Column({ type: "text", nullable: true })
  serviceAreas: string;

  @Column({ default: 1 })
  minEngagementDays: number;

  @Column({ default: 365 })
  maxEngagementDays: number;

  @Column({ type: "simple-array", nullable: true })
  certifications: string[];

  @Column({ type: "decimal", precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
