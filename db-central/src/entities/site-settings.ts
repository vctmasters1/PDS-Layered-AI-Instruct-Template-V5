import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("site_settings")
export class SiteSettings {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  key: string;

  @Column({ type: "text", nullable: true })
  value: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: false })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
