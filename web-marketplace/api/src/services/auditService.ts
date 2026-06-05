import AppDataSource from "../database.js";
import { AuditLog } from "../entities/audit-log.js";

/**
 * AuditService — Provides helper methods for writing immutable audit log entries.
 * 
 * GAAP compliance: Every mutation to a financial entity must be logged here.
 * Entries are insert-only; they must NEVER be updated or deleted.
 */
export class AuditService {
  /**
   * Log a change to a financial entity.
   */
  async log(params: {
    entityType: string;
    entityId: string;
    action: "CREATE" | "UPDATE" | "SOFT_DELETE" | "STATUS_CHANGE";
    userId?: string;
    changes?: Record<string, { old: any; new: any }>;
    snapshot?: any;
    reason?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AuditLog);
      const entry = new AuditLog();
      entry.entityType = params.entityType;
      entry.entityId = params.entityId;
      entry.action = params.action;
      entry.userId = params.userId || undefined as any;
      entry.changes = params.changes ? JSON.stringify(params.changes) : undefined as any;
      entry.snapshot = params.snapshot ? JSON.stringify(params.snapshot) : undefined as any;
      entry.reason = params.reason || undefined as any;
      entry.ipAddress = params.ipAddress || undefined as any;
      await repo.save(entry);
    } catch (error) {
      // Audit logging should never crash the main operation
      console.error("[AUDIT] Failed to write audit log:", error);
    }
  }

  /**
   * Log entity creation.
   */
  async logCreate(entityType: string, entityId: string, userId?: string, snapshot?: any, ipAddress?: string): Promise<void> {
    await this.log({ entityType, entityId, action: "CREATE", userId, snapshot, ipAddress });
  }

  /**
   * Log entity update with changed fields.
   */
  async logUpdate(
    entityType: string,
    entityId: string,
    userId: string,
    changes: Record<string, { old: any; new: any }>,
    ipAddress?: string
  ): Promise<void> {
    await this.log({ entityType, entityId, action: "UPDATE", userId, changes, ipAddress });
  }

  /**
   * Log soft-deletion of an entity.
   */
  async logSoftDelete(entityType: string, entityId: string, userId: string, reason?: string, ipAddress?: string): Promise<void> {
    await this.log({ entityType, entityId, action: "SOFT_DELETE", userId, reason, ipAddress });
  }

  /**
   * Log status change on a financial entity (order, bid, milestone, dispute).
   */
  async logStatusChange(
    entityType: string,
    entityId: string,
    userId: string,
    oldStatus: string,
    newStatus: string,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      entityType,
      entityId,
      action: "STATUS_CHANGE",
      userId,
      changes: { status: { old: oldStatus, new: newStatus } },
      ipAddress,
    });
  }
}

export const auditService = new AuditService();
