import AppDataSource from "../database.js";
import { Document } from "@db-central/entities/document.js";

export class DocumentRepository {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  async findAll() {
    const repo = AppDataSource.getRepository(Document);
    return await repo.find({ where: { accountId: this.accountId } });
  }

  async findById(id: string) {
    const repo = AppDataSource.getRepository(Document);
    return await repo.findOne({ where: { id, accountId: this.accountId } });
  }

  async create(data: Partial<Document>) {
    const repo = AppDataSource.getRepository(Document);
    const document = repo.create({
      ...data,
      accountId: this.accountId,
    });
    return await repo.save(document);
  }

  async update(id: string, data: Partial<Document>) {
    const repo = AppDataSource.getRepository(Document);
    const document = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!document) return null;
    
    Object.assign(document, data);
    return await repo.save(document);
  }

  async softDelete(id: string) {
    const repo = AppDataSource.getRepository(Document);
    const document = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!document) return null;
    
    document.deletedAt = new Date();
    return await repo.save(document);
  }
}