import AppDataSource from "../database.js";
import { Account } from "@db-central/entities/account.js";

/**
 * AccountService - Handles business logic for property portal accounts.
 */
export class AccountService {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Get account status and configuration.
   */
  async getStatus() {
    const repo = AppDataSource.getRepository(Account);
    const account = await repo.findOne({ where: { id: this.accountId } });

    if (!account) {
      throw new Error("Account not found");
    }

    return {
      id: account.id,
      userId: account.userId,
      companyName: account.companyName,
      role: account.role,
      status: account.status,
      tenantPortalEnabled: account.tenantPortalEnabled,
      tenantPortalUrlSlug: account.tenantPortalUrlSlug,
      storageLimitMB: account.storageLimitMB,
      currentStorageUsageMB: account.currentStorageUsageMB,
      defaultAccountingBasis: account.defaultAccountingBasis,
    };
  }

  /**
   * Update account settings.
   */
  async updateSettings(settings: Partial<Account>) {
    const repo = AppDataSource.getRepository(Account);
    const account = await repo.findOne({ where: { id: this.accountId } });

    if (!account) {
      throw new Error("Account not found");
    }

    Object.assign(account, settings);
    return await repo.save(account);
  }

  /**
   * Get storage and usage statistics.
   */
 async getUsage() {
    // TODO: Implement actual storage tracking with AWS S3
    const repo = AppDataSource.getRepository(Account);
    const account = await repo.findOne({ where: { id: this.accountId } });

    if (!account) {
      throw new Error("Account not found");
    }

    return {
      storageLimitMB: account.storageLimitMB,
      currentStorageUsageMB: account.currentStorageUsageMB,
      totalProperties: account.totalProperties,
      activeLeases: account.activeLeases,
    };
  }

  /**
   * Verify account details.
   */
  async verifyAccount() {
    const repo = AppDataSource.getRepository(Account);
    const account = await repo.findOne({ where: { id: this.accountId } });

    if (!account) {
      throw new Error("Account not found");
    }

    // TODO: Implement verification logic (document upload, identity check)
    return { verified: false };
  }
}