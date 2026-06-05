import { Repository } from "typeorm";
import {
  Notification,
  NotificationType,
  NotificationPreference,
  User,
} from "../entities/index.js";
import AppDataSource from "../database.js";
import { emitNotification } from "./websocket.js";

export class NotificationService {
  private notificationRepository: Repository<Notification>;
  private preferencesRepository: Repository<NotificationPreference>;
  private userRepository: Repository<User>;

  constructor() {
    this.notificationRepository = AppDataSource.getRepository(Notification);
    this.preferencesRepository = AppDataSource.getRepository(NotificationPreference);
    this.userRepository = AppDataSource.getRepository(User);
  }

  /**
   * Create a notification for a user
   * Respects user notification preferences
   */
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    options?: {
      senderId?: string;
      relatedEntityId?: string;
      relatedEntityType?: string;
      badge?: string;
      actionUrl?: string;
      actionLabel?: string;
    }
  ): Promise<Notification | null> {
    try {
      // Verify user exists
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        console.error(`Notification: User ${userId} not found`);
        return null;
      }

      // Check user preferences (if enabled)
      const shouldCreate = await this.shouldSendNotification(userId, type);
      if (!shouldCreate) {
        console.log(`Notification skipped for user ${userId}, type ${type}`);
        return null;
      }

      // Create notification
      const notification = new Notification();
      notification.userId = userId;
      notification.type = type;
      notification.title = title;
      notification.message = message;
      if (options?.senderId) notification.senderId = options.senderId;
      if (options?.relatedEntityId) notification.relatedEntityId = options.relatedEntityId;
      if (options?.relatedEntityType) notification.relatedEntityType = options.relatedEntityType;
      if (options?.badge) notification.badge = options.badge;
      if (options?.actionUrl) notification.actionUrl = options.actionUrl;
      if (options?.actionLabel) notification.actionLabel = options.actionLabel;
      notification.read = false;

      await this.notificationRepository.save(notification);

      // Push real-time notification via WebSocket
      try {
        emitNotification(userId, {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          body: notification.message,
        });
      } catch (_wsErr) {
        // WebSocket emit is best-effort — don't fail the notification creation
      }

      console.log(`Notification created: ${notification.id} for user ${userId}`);
      return notification;
    } catch (error) {
      console.error("Error creating notification:", error);
      return null;
    }
  }

  /**
   * Check if notification should be sent based on user preferences
   */
  private async shouldSendNotification(
    userId: string,
    type: NotificationType
  ): Promise<boolean> {
    try {
      let preferences = await this.preferencesRepository.findOne({
        where: { userId },
      });

      // Create default preferences if not exists
      if (!preferences) {
        preferences = this.preferencesRepository.create({ userId });
        await this.preferencesRepository.save(preferences);
      }

      // Check if notification type is disabled
      if (preferences.disabledTypes?.includes(type)) {
        return false;
      }

      // Check category-level preferences
      if (
        type.startsWith("ORDER_") &&
        !preferences.orderNotifications
      ) {
        return false;
      }
      if (
        type.startsWith("BID_") &&
        !preferences.bidNotifications
      ) {
        return false;
      }
      if (
        type.startsWith("PAYMENT_") &&
        !preferences.paymentNotifications
      ) {
        return false;
      }
      if (
        type.startsWith("DISPUTE_") &&
        !preferences.disputeNotifications
      ) {
        return false;
      }
      if (
        type === NotificationType.MESSAGE_RECEIVED &&
        !preferences.messageNotifications
      ) {
        return false;
      }
      if (
        type === NotificationType.CONVERSATION_STARTED &&
        !preferences.messageNotifications
      ) {
        return false;
      }

      return preferences.inAppNotifications; // Must have in-app enabled
    } catch (error) {
      console.error("Error checking notification preferences:", error);
      return true; // Default: send if check fails
    }
  }

  /**
   * Get unread notifications for a user
   */
  async getUnreadNotifications(userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId, read: false, archived: false },
      order: { createdAt: "DESC" },
      take: 50, // Limit to prevent huge queries
    });
  }

  /**
   * Get all notifications for a user (paginated)
   */
  async getNotifications(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ notifications: Notification[]; total: number }> {
    const [notifications, total] = await this.notificationRepository
      .createQueryBuilder("n")
      .where("n.userId = :userId", { userId })
      .andWhere("n.archived = false")
      .orderBy("n.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { notifications, total };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.notificationRepository.update(
        { id: notificationId, userId },
        { read: true, readAt: new Date() }
      );
      return result?.affected ? result.affected > 0 : false;
    } catch (error) {
      console.error("Error marking notification as read:", error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      await this.notificationRepository.update(
        { userId, read: false },
        { read: true, readAt: new Date() }
      );
      return true;
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      return false;
    }
  }

  /**
   * Archive notification
   */
  async archiveNotification(
    notificationId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const result = await this.notificationRepository.update(
        { id: notificationId, userId },
        { archived: true }
      );
      return result?.affected ? result.affected > 0 : false;
    } catch (error) {
      console.error("Error archiving notification:", error);
      return false;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(
    notificationId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const result = await this.notificationRepository.delete({
        id: notificationId,
        userId,
      });
      return result?.affected ? result.affected > 0 : false;
    } catch (error) {
      console.error("Error deleting notification:", error);
      return false;
    }
  }

  /**
   * Get user notification preferences
   */
  async getPreferences(userId: string): Promise<NotificationPreference> {
    let preferences = await this.preferencesRepository.findOne({
      where: { userId },
    });

    // Create default if not exists
    if (!preferences) {
      preferences = this.preferencesRepository.create({ userId });
      await this.preferencesRepository.save(preferences);
    }

    return preferences;
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreference>
  ): Promise<NotificationPreference> {
    let preferences = await this.preferencesRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      preferences = this.preferencesRepository.create({ userId, ...updates });
    } else {
      Object.assign(preferences, updates);
    }

    await this.preferencesRepository.save(preferences);
    return preferences;
  }

  /**
   * Get count of unread notifications
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, read: false, archived: false },
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
