import AppDataSource from "../database.js";
import { Tenant } from "@db-central/entities/tenant.js";

export class TenantRepository {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  async findAll() {
    const repo = AppDataSource.getRepository(Tenant);
    return await repo.find({ where: { accountId: this.accountId } });
  }

  async findById(id: string) {
    const repo = AppDataSource.getRepository(Tenant);
    return await repo.findOne({ where: { id, accountId: this.accountId } });
  }

  async create(data: Partial<Tenant>) {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = repo.create({
      ...data,
      accountId: this.accountId,
    });
    return await repo.save(tenant);
  }

  async update(id: string, data: Partial<Tenant>) {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!tenant) return null;
    
    Object.assign(tenant, data);
    return await repo.save(tenant);
  }

  async softDelete(id: string) {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!tenant) return null;
    
    tenant.deletedAt = new Date();
    return await repo.save(tenant);
  }
}