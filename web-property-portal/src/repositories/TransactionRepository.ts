import AppDataSource from "../database.js";
import { Transaction } from "@db-central/entities/transaction.js";

export class TransactionRepository {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  async findAll() {
    const repo = AppDataSource.getRepository(Transaction);
    return await repo.find({ where: { accountId: this.accountId } });
  }

  async findById(id: string) {
    const repo = AppDataSource.getRepository(Transaction);
    return await repo.findOne({ where: { id, accountId: this.accountId } });
  }

  async create(data: Partial<Transaction>) {
    const repo = AppDataSource.getRepository(Transaction);
    const transaction = repo.create({
      ...data,
      accountId: this.accountId,
    });
    return await repo.save(transaction);
  }

  async update(id: string, data: Partial<Transaction>) {
    const repo = AppDataSource.getRepository(Transaction);
    const transaction = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!transaction) return null;
    
    Object.assign(transaction, data);
    return await repo.save(transaction);
  }

  async softDelete(id: string) {
    const repo = AppDataSource.getRepository(Transaction);
    const transaction = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!transaction) return null;
    
    transaction.deletedAt = new Date();
    return await repo.save(transaction);
  }

  async updateStatus(id: string, status: keyof typeof Transaction.Status) {
    const repo = AppDataSource.getRepository(Transaction);
    const transaction = await repo.findOne({ where: { id, accountId: this.accountId } });
    
    if (!transaction) return null;
    
    transaction.status = status;
    return await repo.save(transaction);
  }

  async findByBasis(basis: "accrual" | "cash") {
    const repo = AppDataSource.getRepository(Transaction);
    const normalised = basis.toUpperCase() as "ACCRUAL" | "CASH";
    return await repo.find({ 
      where: { accountId: this.accountId, accountingBasis: normalised } 
    });
  }
}