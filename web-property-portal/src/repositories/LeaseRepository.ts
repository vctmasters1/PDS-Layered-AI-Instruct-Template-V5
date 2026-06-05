import AppDataSource from "../database.js";
import { Lease } from "@db-central/entities/lease.js";

export class LeaseRepository {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  async findAll() {
    const repo = AppDataSource.getRepository(Lease);
    return await repo.find({ where: { accountId: this.accountId } });
  }

  async findById(id: string) {
    const repo = AppDataSource.getRepository(Lease);
    return await repo.findOne({ where: { id, accountId: this.accountId } });
  }

  async create(data: Partial<Lease>) {
    const repo = AppDataSource.getRepository(Lease);
    const lease = repo.create({
      ...data,
      accountId: this.accountId,
    });
    return await repo.save(lease);
  }

  async update(id: string, data: Partial<Lease>) {
    const repo = AppDataSource.getRepository(Lease);
    const lease = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!lease) return null;
    
    Object.assign(lease, data);
    return await repo.save(lease);
  }

  async softDelete(id: string) {
    const repo = AppDataSource.getRepository(Lease);
    const lease = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!lease) return null;
    
    lease.deletedAt = new Date();
    return await repo.save(lease);
  }

  async updateStatus(id: string, status: keyof typeof Lease.Status) {
    const repo = AppDataSource.getRepository(Lease);
    const lease = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!lease) return null;
    
    lease.status = status;
    return await repo.save(lease);
  }
}