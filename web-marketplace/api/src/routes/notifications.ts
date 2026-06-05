import { Router, Request, Response } from "express";
import { Repository } from "typeorm";
import { Notification, NotificationPreference } from "../entities/index.js";
import AppDataSource from "../database.js";
import { verifyToken } from "./auth.js";
import { notificationService } from "../services/notificationService.js";

const router = Router();

// Lazy repo accessors to avoid module-level initialization before DB is ready
const getNotificationRepo = () => AppDataSource.getRepository(Notification);
const getPreferencesRepo = () => AppDataSource.getRepository(NotificationPreference);

/**
 * GET /v1/notifications
 * Get user's notifications (paginated)
 */
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.min(parseInt(req.query.offset as string) || 0, 10000);
    const type = req.query.type as string; // Optional filter by type
    const readFilter = req.query.read; // Optional: "true", "false", or undefined

    let query = getNotificationRepo()
      .createQueryBuilder("n")
      .where("n.userId = :userId", { userId })
      .andWhere("n.archived = false");

    if (type) {
      query = query.andWhere("n.type = :type", { type });
    }

    if (readFilter !== undefined) {
      const isRead = readFilter === "true";
      query = query.andWhere("n.read = :read", { read: isRead });
    }

    const [notifications, total] = await query
      .orderBy("n.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    // Get actual unread count separately
    const actualUnreadCount = await getNotificationRepo().count({
      where: { userId, read: false, archived: false },
    });

    res.json({
      success: true,
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        badge: n.badge,
        read: n.read,
        readAt: n.readAt,
        relatedEntityId: n.relatedEntityId,
        relatedEntityType: n.relatedEntityType,
        actionUrl: n.actionUrl,
        actionLabel: n.actionLabel,
        createdAt: n.createdAt,
      })),
      total,
      unreadCount: actualUnreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ success: false, error: "Failed to fetch notifications" });
  }
});

/**
 * GET /v1/notifications/unread
 * Get only unread notifications
 */
router.get("/unread", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const unreadNotifications = await getNotificationRepo().find({
      where: { userId, read: false, archived: false },
      order: { createdAt: "DESC" },
      take: 50,
    });

    res.json({
      success: true,
      notifications: unreadNotifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        badge: n.badge,
        read: n.read,
        relatedEntityId: n.relatedEntityId,
        actionUrl: n.actionUrl,
        actionLabel: n.actionLabel,
        createdAt: n.createdAt,
      })),
      count: unreadNotifications.length,
    });
  } catch (error) {
    console.error("Error fetching unread notifications:", error);
    res.status(500).json({ success: false, error: "Failed to fetch unread notifications" });
  }
});

/**
 * GET /v1/notifications/count
 * Get count of unread notifications
 */
router.get("/count/unread", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const unreadCount = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({ success: false, error: "Failed to get unread count" });
  }
});

/**
 * PATCH /v1/notifications/mark-all-read
 * Mark all notifications as read
 * NOTE: Must be defined BEFORE /:id/read to prevent "mark-all-read" matching as :id
 */
router.patch("/mark-all-read", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const success = await notificationService.markAllAsRead(userId);
    if (!success) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to mark all as read" });
    }

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all as read:", error);
    res.status(500).json({ success: false, error: "Failed to mark all as read" });
  }
});

/**
 * PATCH /v1/notifications/:id/read
 * Mark a notification as read
 */
router.patch("/:id/read", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const notificationId = req.params.id;

    const success = await notificationService.markAsRead(notificationId, userId);
    if (!success) {
      return res.status(404).json({
        success: false,
        error: "Notification not found or not owned by user",
      });
    }

    res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ success: false, error: "Failed to mark notification as read" });
  }
});

/**
 * DELETE /v1/notifications/:id
 * Delete/archive a notification
 */
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const notificationId = req.params.id;

    const success = await notificationService.archiveNotification(notificationId, userId);
    if (!success) {
      return res.status(404).json({
        success: false,
        error: "Notification not found or not owned by user",
      });
    }

    res.json({ success: true, message: "Notification archived" });
  } catch (error) {
    console.error("Error archiving notification:", error);
    res.status(500).json({ success: false, error: "Failed to archive notification" });
  }
});

/**
 * GET /v1/notifications/preferences
 * Get user's notification preferences
 */
router.get("/preferences", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const preferences = await notificationService.getPreferences(userId);

    res.json({
      success: true,
      preferences: {
        emailNotifications: preferences.emailNotifications,
        inAppNotifications: preferences.inAppNotifications,
        orderNotifications: preferences.orderNotifications,
        bidNotifications: preferences.bidNotifications,
        paymentNotifications: preferences.paymentNotifications,
        disputeNotifications: preferences.disputeNotifications,
        messageNotifications: preferences.messageNotifications,
        systemNotifications: preferences.systemNotifications,
        disabledTypes: preferences.disabledTypes || [],
        quietHoursEnabled: preferences.quietHoursEnabled,
        quietHoursStart: preferences.quietHoursStart,
        quietHoursEnd: preferences.quietHoursEnd,
      },
    });
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    res.status(500).json({ success: false, error: "Failed to fetch preferences" });
  }
});

/**
 * PATCH /v1/notifications/preferences
 * Update user's notification preferences
 */
router.patch("/preferences", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const updates = req.body;

    // Validate inputs if provided
    if (updates.quietHoursStart && !isValidTimeFormat(updates.quietHoursStart)) {
      return res.status(400).json({
        success: false,
        error: "Invalid time format for quietHoursStart (use HH:MM)",
      });
    }
    if (updates.quietHoursEnd && !isValidTimeFormat(updates.quietHoursEnd)) {
      return res.status(400).json({
        success: false,
        error: "Invalid time format for quietHoursEnd (use HH:MM)",
      });
    }

    const preferences = await notificationService.updatePreferences(userId, updates);

    res.json({
      success: true,
      message: "Preferences updated",
      preferences: {
        emailNotifications: preferences.emailNotifications,
        inAppNotifications: preferences.inAppNotifications,
        orderNotifications: preferences.orderNotifications,
        bidNotifications: preferences.bidNotifications,
        paymentNotifications: preferences.paymentNotifications,
        disputeNotifications: preferences.disputeNotifications,
        messageNotifications: preferences.messageNotifications,
        systemNotifications: preferences.systemNotifications,
        disabledTypes: preferences.disabledTypes || [],
        quietHoursEnabled: preferences.quietHoursEnabled,
        quietHoursStart: preferences.quietHoursStart,
        quietHoursEnd: preferences.quietHoursEnd,
      },
    });
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    res.status(500).json({ success: false, error: "Failed to update preferences" });
  }
});

/**
 * Helper function to validate time format (HH:MM)
 */
function isValidTimeFormat(time: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

export default router;
