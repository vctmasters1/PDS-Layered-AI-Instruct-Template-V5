import AppDataSource from "../database.js";
import { MaintenanceRequest } from "@db-central/entities/maintenance_request.js";

export class MaintenanceRepository {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  async findAll() {
    const repo = AppDataSource.getRepository(MaintenanceRequest);
    return await repo.find({ where: { accountId: this.accountId } });
  }

  async findById(id: string) {
    const repo = AppDataSource.getRepository(MaintenanceRequest);
    return await repo.findOne({ where: { id, accountId: this.accountId } });
  }

  async create(data: Partial<MaintenanceRequest>) {
    const repo = AppDataSource.getRepository(MaintenanceRequest);
    const request = repo.create({
      ...data,
      accountId: this.accountId,
    });
    return await repo.save(request);
  }

  async update(id: string, data: Partial<MaintenanceRequest>) {
    const repo = AppDataSource.getRepository(MaintenanceRequest);
    const request = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!request) return null;
    
    Object.assign(request, data);
    return await repo.save(request);
  }

  async softDelete(id: string) {
    const repo = AppDataSource.getRepository(MaintenanceRequest);
    const request = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!request) return null;
    
    request.deletedAt = new Date();
    return await repo.save(request);
  }

  async updateStatus(id: string, status: keyof typeof MaintenanceRequest.Status) {
    const repo = AppDataSource.getRepository(MaintenanceRequest);
    const request = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!request) return null;
    
    request.status = status;
    return await repo.save(request);
  }
}