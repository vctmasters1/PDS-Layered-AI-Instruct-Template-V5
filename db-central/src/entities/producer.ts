import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.js";

@Entity("producers")
@Index(["location_state"])
@Index(["location_latitude", "location_longitude"])
export class Producer {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @OneToOne(() => User, (user) => user.producerProfile)
  @JoinColumn()
  user: User;

  @Column({ unique: true })
  businessName: string;

  @Column()
  location_address: string;

  @Column()
  location_city: string;

  @Column()
  location_state: string;

  @Column()
  location_zipCode: string;

  @Column({ default: "USA" })
  location_country: string;

  @Column("decimal", { precision: 10, scale: 8 })
  location_latitude: number;

  @Column("decimal", { precision: 11, scale: 8 })
  location_longitude: number;

  @Column({ nullable: true })
  location_serviceRadius: number;

  @Column({ nullable: true, type: "text" })
  description: string;

  @Column({ nullable: true, type: "text" })
  bio: string;

  @Column({ nullable: true })
  website: string;

  @Column({ type: "simple-array", nullable: true })
  capabilities_materialTypes: string[];

  @Column({ type: "simple-array", nullable: true })
  capabilities_productTypes: string[];

  @Column({ nullable: true })
  capabilities_minBatchSize: number;

  @Column({ nullable: true })
  capabilities_maxCapacityPerMonth: number;

  @Column({ type: "decimal", precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewCount: number;

  @Column({ default: 0 })
  verifiedReviewCount: number;

  @Column({ default: 0 })
  totalOrdersFulfilled: number;

  @Column({ default: 0 })
  averageLeadTime: number;

  @Column({ default: "available" })
  availability: string;

  @Column({ default: 0 })
  waitlistCount: number;

  @Column({ default: 0 })
  acceptanceRate: number;

  @Column({ default: true })
  verified: boolean;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
