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

export enum BusinessType {
  INDIVIDUAL = "individual",
  CREATOR = "creator",
  SMALL_PRODUCER = "small_producer",
}

@Entity("designers")
@Index(["location_state"])
@Index(["location_latitude", "location_longitude"])
export class Designer {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @OneToOne(() => User, (user) => user.designerProfile)
  @JoinColumn()
  user: User;

  @Column({ unique: true })
  businessName: string;

  @Column({
    type: "enum",
    enum: BusinessType,
    default: BusinessType.CREATOR,
  })
  businessType: BusinessType;

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
  bio: string;

  @Column({ nullable: true })
  website: string;

  @Column({ type: "decimal", precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewCount: number;

  @Column({ default: 0 })
  verifiedReviewCount: number;

  @Column({ default: 0 })
  totalSales: number;

  @Column({ default: 0 })
  averageLeadTime: number;

  @Column({ default: "available" })
  availability: string;

  @Column({ default: 0 })
  waitlistCount: number;

  @Column({ default: false })
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
