import AppDataSource from "../database.js";
import { Property } from "@db-central/entities/property.js";

/**
 * PropertyRepository - Repository for property operations.
 */
export class PropertyRepository {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Find all properties for the given account.
   */
  async findAll() {
    const repo = AppDataSource.getRepository(Property);
    return await repo.find({ where: { accountId: this.accountId } });
  }

  /**
   * Find property by ID.
   */
  async findById(id: string) {
    const repo = AppDataSource.getRepository(Property);
    return await repo.findOne({ where: { id, accountId: this.accountId } });
  }

  /**
   * Create a new property.
   */
  async create(data: Partial<Property>) {
    const repo = AppDataSource.getRepository(Property);
    const property = repo.create({
      ...data,
      accountId: this.accountId,
    });
    return await repo.save(property);
  }

  /**
   * Update an existing property.
   */
  async update(id: string, data: Partial<Property>) {
    const repo = AppDataSource.getRepository(Property);
    const property = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!property) {
      return null;
    }
    
    Object.assign(property, data);
    return await repo.save(property);
  }

  /**
   * Soft delete a property.
   */
  async softDelete(id: string) {
    const repo = AppDataSource.getRepository(Property);
    const property = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!property) {
      return null;
    }
    
    property.deletedAt = new Date();
    return await repo.save(property);
  }
}