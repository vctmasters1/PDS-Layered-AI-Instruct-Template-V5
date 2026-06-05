import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("firmware")
@Index(["boardType", "hwRev", "role"])
@Index(["version"])
@Index(["active"])
@Index(["releasedAt"])
export class Firmware {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  version: string;

  @Column()
  boardType: string;

  @Column()
  hwRev: string;

  @Column()
  role: string;

  @Column()
  filePath: string;

  @Column({ nullable: true })
  sha256: string;

  @Column({ nullable: true })
  binarySize: number;

  @Column({ default: false })
  active: boolean;

  @Column({ nullable: true })
  releasedAt: Date;

  @Column({ nullable: true, type: "text" })
  releaseNotes: string;

  @Column({ nullable: true })
  uploadedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
