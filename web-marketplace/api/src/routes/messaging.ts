import { Router, Request, Response } from "express";
import { Repository } from "typeorm";
import { Message, User, Notification, NotificationType, MessageFee, MessagingFeeWaiver } from "../entities/index.js";
import AppDataSource from "../database.js";
import { verifyToken } from "./auth.js";
import { messageLimiter } from "../middleware/security.js";
import { notificationService } from "../services/notificationService.js";
import { emitNewMessage } from "../services/websocket.js";

const router = Router();

// Lazy repository accessors to avoid module-level initialization before DB is ready
const getMessageRepo = () => AppDataSource.getRepository(Message);
const getUserRepo = () => AppDataSource.getRepository(User);
const getMessageFeeRepo = () => AppDataSource.getRepository(MessageFee);
const getWaiverRepo = () => AppDataSource.getRepository(MessagingFeeWaiver);

/** Messaging fee amount in dollars */
const MESSAGE_FEE = parseFloat(process.env.MESSAGE_FEE_USD || "1.00");

/**
 * Fee split after Stripe processing costs.
 * Default: $1.00 charge − Stripe fee (2.9% + $0.30 = $0.33) = $0.67 net.
 * Override via env: STRIPE_FEE_PERCENT and STRIPE_FEE_FIXED (in dollars).
 * PipeDream always rounds UP to the nearest penny.
 *   Platform : ceil($0.67 / 2) = $0.34
 *   Responder: $0.67 − $0.34 = $0.33
 */
const STRIPE_PERCENT = parseFloat(process.env.STRIPE_FEE_PERCENT || "0.029");
const STRIPE_FIXED = parseFloat(process.env.STRIPE_FEE_FIXED || "0.30");
function calcFeeShares(chargeAmount: number) {
  const stripeFee = Math.round((chargeAmount * STRIPE_PERCENT + STRIPE_FIXED) * 100) / 100;
  const netAfterStripe = Math.round((chargeAmount - stripeFee) * 100) / 100;
  const platformShare = Math.ceil((netAfterStripe / 2) * 100) / 100; // round UP
  const recipientShare = Math.round((netAfterStripe - platformShare) * 100) / 100;
  return { stripeFee, netAfterStripe, platformShare, recipientShare };
}

// Pre-computed for $1.00 (used in display / summary endpoints)
const DEFAULT_SHARES = calcFeeShares(MESSAGE_FEE);
const PLATFORM_SHARE_AMOUNT = DEFAULT_SHARES.platformShare;  // $0.34
const RECIPIENT_SHARE_AMOUNT = DEFAULT_SHARES.recipientShare; // $0.33

/** Get today's billing period key (YYYY-MM-DD in UTC) */
function getBillingPeriod(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * GET /v1/messaging/conversations
 * Get list of recent conversations for current user
 */
router.get("/conversations", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const messageRepository = getMessageRepo();
    const userRepository = getUserRepo();

    // Get unique conversation partners
    const conversationIds = await messageRepository
      .createQueryBuilder("m")
      .select("m.conversationId", "conversationId")
      .addSelect("MAX(m.createdAt)", "latestCreatedAt")
      .where("(m.senderId = :userId OR m.recipientId = :userId)", { userId })
      .andWhere(
        "((m.senderId = :userId AND m.archived = false) OR (m.recipientId = :userId AND m.recipientArchived = false))",
        { userId }
      )
      .groupBy("m.conversationId")
      .orderBy("\"latestCreatedAt\"", "DESC")
      .limit(limit)
      .getRawMany();

    const conversations = [];

    for (const { conversationId } of conversationIds) {
      // Get latest message in conversation
      const latestMessage = await messageRepository
        .createQueryBuilder("m")
        .where("m.conversationId = :conversationId", { conversationId })
        .orderBy("m.createdAt", "DESC")
        .take(1)
        .getOne();

      if (!latestMessage) continue;

      // Determine the other user in conversation
      const otherUserId =
        latestMessage.senderId === userId
          ? latestMessage.recipientId
          : latestMessage.senderId;

      const otherUser = await userRepository.findOne({ where: { id: otherUserId } });
      if (!otherUser) continue;

      // Count unread messages in this conversation
      const unreadCount = await messageRepository.count({
        where: {
          conversationId,
          recipientId: userId,
          read: false,
        },
      });

      conversations.push({
        conversationId,
        otherUser: {
          id: otherUser.id,
          email: otherUser.email,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
        },
        lastMessage: {
          id: latestMessage.id,
          content: latestMessage.content,
          subject: latestMessage.subject,
          senderId: latestMessage.senderId,
          createdAt: latestMessage.createdAt,
        },
        unreadCount,
      });
    }

    res.json({
      success: true,
      conversations,
      total: conversations.length,
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ success: false, error: "Failed to fetch conversations" });
  }
});

/**
 * GET /v1/messaging/with/:userId
 * Get conversation messages with a specific user
 */
router.get("/with/:userId", verifyToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).userId;
    const otherUserId = req.params.userId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = Math.min(parseInt(req.query.offset as string) || 0, 10000);
    const messageRepository = getMessageRepo();
    const userRepository = getUserRepo();

    // Verify other user exists
    const otherUser = await userRepository.findOne({ where: { id: otherUserId } });
    if (!otherUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Get messages between users (ordered chronologically)
    const [messages, total] = await messageRepository
      .createQueryBuilder("m")
      .where(
        "(m.senderId = :currentUserId AND m.recipientId = :otherUserId AND m.archived = false) OR " +
          "(m.senderId = :otherUserId AND m.recipientId = :currentUserId AND m.recipientArchived = false)",
        { currentUserId, otherUserId }
      )
      .orderBy("m.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    // Mark unread messages from other user as read
    await messageRepository.update(
      {
        senderId: otherUserId,
        recipientId: currentUserId,
        read: false,
      },
      { read: true, readAt: new Date() }
    );

    // Reverse to get chronological order
    messages.reverse();

    res.json({
      success: true,
      conversation: {
        otherUser: {
          id: otherUser.id,
          email: otherUser.email,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
        },
        messages: messages.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          recipientId: m.recipientId,
          subject: m.subject,
          content: m.content,
          read: m.read,
          readAt: m.readAt,
          relatedOrderId: m.relatedOrderId,
          relatedBidId: m.relatedBidId,
          relatedDisputeId: m.relatedDisputeId,
          createdAt: m.createdAt,
        })),
        total,
      },
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ success: false, error: "Failed to fetch conversation" });
  }
});

/**
 * POST /v1/messaging/send
 * Send a message to another user
 */
router.post("/send", messageLimiter, verifyToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).userId;
    const { recipientId, subject, content, relatedOrderId, relatedBidId, relatedDisputeId } = req.body;

    // Validate input
    if (!recipientId || !content) {
      return res.status(400).json({
        success: false,
        error: "recipientId and content are required",
      });
    }

    if (currentUserId === recipientId) {
      return res.status(400).json({
        success: false,
        error: "Cannot send message to yourself",
      });
    }

    const messageRepository = getMessageRepo();
    const userRepository = getUserRepo();
    const messageFeeRepository = getMessageFeeRepo();
    const waiverRepository = getWaiverRepo();

    // Verify recipient exists
    const recipient = await userRepository.findOne({ where: { id: recipientId } });
    if (!recipient) {
      return res.status(404).json({ success: false, error: "Recipient not found" });
    }

    // Create or reuse conversation ID
    const conversationId =
      req.body.conversationId ||
      `${[currentUserId, recipientId].sort().join("-")}`;

    // Create message
    const message = messageRepository.create({
      conversationId,
      senderId: currentUserId,
      recipientId,
      subject: subject || "No Subject",
      content,
      relatedOrderId: relatedOrderId || null,
      relatedBidId: relatedBidId || null,
      relatedDisputeId: relatedDisputeId || null,
      messageType: "user_message",
      read: false,
    });

    await messageRepository.save(message);

    // --- Messaging Fee Logic ---
    // Determine if the current sender is the RESPONDER (not the initiator).
    // The initiator is whoever sent the first message in this conversation.
    // Responders reply for FREE — only the initiator pays $1.00 per message.
    const firstMessage = await messageRepository.findOne({
      where: { conversationId },
      order: { createdAt: "ASC" },
    });
    const isResponder = firstMessage ? firstMessage.senderId !== currentUserId : false;

    // Check if recipient has waived fees for this sender
    const waiver = await waiverRepository.findOne({
      where: { grantedByUserId: recipientId, grantedToUserId: currentUserId, active: true },
    });

    const isWaived = !!waiver || isResponder; // Responders are always free
    const feeAmount = isWaived ? 0 : MESSAGE_FEE;

    // Determine the recipient's share:
    // The responder only earns $0.33 if they have actually replied in this conversation.
    // Until they respond, PipeDream keeps the full net ($0.67).
    let recipientShareAmount = 0;
    let platformShareAmount = 0;
    if (!isWaived) {
      // Check if the responder (recipient) has sent any message in this conversation
      const responderHasReplied = await messageRepository.findOne({
        where: { conversationId, senderId: recipientId },
      });
      if (responderHasReplied) {
        platformShareAmount = PLATFORM_SHARE_AMOUNT;  // $0.34
        recipientShareAmount = RECIPIENT_SHARE_AMOUNT; // $0.33
      } else {
        // Responder hasn't replied yet — PipeDream keeps the full net
        platformShareAmount = PLATFORM_SHARE_AMOUNT + RECIPIENT_SHARE_AMOUNT; // $0.67
        recipientShareAmount = 0;
      }
    }

    // Create fee record (even if waived/free, for audit trail)
    const fee = messageFeeRepository.create({
      messageId: message.id,
      senderId: currentUserId,
      recipientId,
      amount: feeAmount,
      platformShare: platformShareAmount,
      recipientShare: recipientShareAmount,
      waived: isWaived,
      billingPeriod: getBillingPeriod(),
      billed: false,
    });
    await messageFeeRepository.save(fee);

    // If this is the RESPONDER's first reply, retroactively credit them their
    // share on all unbilled initiator messages in this conversation.
    if (isResponder) {
      const responderMsgCount = await messageRepository.count({
        where: { conversationId, senderId: currentUserId },
      });
      // If this is the first or second reply, update unbilled fees
      if (responderMsgCount <= 2) {
        // The initiator is the other person (recipientId from our perspective)
        await messageFeeRepository
          .createQueryBuilder()
          .update(MessageFee)
          .set({
            recipientShare: RECIPIENT_SHARE_AMOUNT,
            platformShare: PLATFORM_SHARE_AMOUNT,
          })
          .where("senderId = :initiatorId AND recipientId = :responderId", {
            initiatorId: recipientId,   // the other user is the initiator
            responderId: currentUserId, // I am the responder/recipient
          })
          .andWhere("billed = false")
          .andWhere("waived = false")
          .andWhere("recipientShare = 0")
          .execute();
      }
    }

    // Create notification for recipient
    // Look up the sender's name for the notification
    const sender = await userRepository.findOne({ where: { id: currentUserId } });
    const senderName = sender?.firstName || "Someone";
    await notificationService.createNotification(
      recipientId,
      NotificationType.MESSAGE_RECEIVED,
      `New message from ${senderName}`,
      content.substring(0, 100), // First 100 chars as preview
      {
        senderId: currentUserId,
        relatedEntityId: message.id,
        relatedEntityType: "message",
        actionUrl: `/messaging?with=${currentUserId}`,
        actionLabel: "View Message",
      }
    );

    // Emit real-time WebSocket event to the recipient
    emitNewMessage(recipientId, {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      recipientId: message.recipientId,
      subject: message.subject,
      content: message.content,
      createdAt: message.createdAt,
    });

    res.status(201).json({
      success: true,
      message: {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        recipientId: message.recipientId,
        subject: message.subject,
        content: message.content,
        createdAt: message.createdAt,
      },
      fee: {
        amount: feeAmount,
        waived: isWaived,
        isResponder,
        billingPeriod: fee.billingPeriod,
        note: isResponder
          ? "Replies are free — only the initiator pays messaging fees"
          : isWaived
            ? "Fee waived by recipient"
            : `$${feeAmount.toFixed(2)} messaging fee will be charged at the end of the billing period (${fee.billingPeriod})`,
      },
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ success: false, error: "Failed to send message" });
  }
});

/**
 * PATCH /v1/messaging/:messageId/read
 * Mark message as read
 */
router.patch("/:messageId/read", verifyToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).userId;
    const messageId = req.params.messageId;
    const messageRepository = getMessageRepo();

    const message = await messageRepository.findOne({ where: { id: messageId } });
    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    // Only recipient can mark as read
    if (message.recipientId !== currentUserId) {
      return res.status(403).json({
        success: false,
        error: "Only recipient can mark as read",
      });
    }

    message.read = true;
    message.readAt = new Date();
    await messageRepository.save(message);

    res.json({ success: true, message: "Message marked as read" });
  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({ success: false, error: "Failed to mark message as read" });
  }
});

/**
 * DELETE /v1/messaging/:messageId
 * Delete/archive message from current user's view
 */
router.delete("/:messageId", verifyToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).userId;
    const messageId = req.params.messageId;
    const messageRepository = getMessageRepo();

    const message = await messageRepository.findOne({ where: { id: messageId } });
    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    // Check ownership
    if (message.senderId === currentUserId) {
      message.archived = true;
    } else if (message.recipientId === currentUserId) {
      message.recipientArchived = true;
    } else {
      return res.status(403).json({
        success: false,
        error: "Not authorized to delete this message",
      });
    }

    await messageRepository.save(message);

    res.json({ success: true, message: "Message archived" });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ success: false, error: "Failed to delete message" });
  }
});

/**
 * GET /v1/messaging/search
 * Search messages by keyword
 */
router.get("/search", verifyToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).userId;
    const query = req.query.q as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: "Search query must be at least 2 characters",
      });
    }

    const messages = await getMessageRepo()
      .createQueryBuilder("m")
      .where("(m.senderId = :userId OR m.recipientId = :userId)", { userId: currentUserId })
      .andWhere("(m.subject LIKE :query OR m.content LIKE :query)", {
        query: `%${query}%`,
      })
      .orderBy("m.createdAt", "DESC")
      .take(limit)
      .getMany();

    res.json({
      success: true,
      results: messages.map((m) => ({
        id: m.id,
        subject: m.subject,
        content: m.content.substring(0, 100),
        senderId: m.senderId,
        recipientId: m.recipientId,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error searching messages:", error);
    res.status(500).json({ success: false, error: "Failed to search messages" });
  }
});

// ============================================================================
// MESSAGING FEES & WAIVERS
// ============================================================================

/**
 * GET /v1/messaging/fees/summary
 * Get messaging fee summary for current user (current billing period + totals)
 */
router.get("/fees/summary", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const today = getBillingPeriod();

    // Fees I owe (messages I sent)
    const myFees = await getMessageFeeRepo()
      .createQueryBuilder("f")
      .where("f.senderId = :userId", { userId })
      .andWhere("f.billingPeriod = :today", { today })
      .andWhere("f.waived = false")
      .getMany();

    const todayTotal = myFees.reduce((sum, f) => sum + Number(f.amount), 0);
    const todayCount = myFees.length;

    // Unbilled total (all periods)
    const unbilledResult = await getMessageFeeRepo()
      .createQueryBuilder("f")
      .select("SUM(f.amount)", "total")
      .addSelect("COUNT(*)", "count")
      .where("f.senderId = :userId", { userId })
      .andWhere("f.billed = false")
      .andWhere("f.waived = false")
      .getRawOne();

    // Earnings from messages received (my share)
    const earningsResult = await getMessageFeeRepo()
      .createQueryBuilder("f")
      .select("SUM(f.recipientShare)", "total")
      .where("f.recipientId = :userId", { userId })
      .andWhere("f.waived = false")
      .getRawOne();

    res.json({
      success: true,
      fees: {
        billingPeriod: today,
        todayMessages: todayCount,
        todayTotal: Number(todayTotal).toFixed(2),
        unbilledTotal: Number(unbilledResult?.total || 0).toFixed(2),
        unbilledCount: Number(unbilledResult?.count || 0),
        earnings: Number(earningsResult?.total || 0).toFixed(2),
        feePerMessage: MESSAGE_FEE.toFixed(2),
        platformSharePerMessage: PLATFORM_SHARE_AMOUNT.toFixed(2),
        recipientSharePerMessage: RECIPIENT_SHARE_AMOUNT.toFixed(2),
        stripeFeePerMessage: DEFAULT_SHARES.stripeFee.toFixed(2),
        note: "Messaging fees are charged at the end of each 24-hour billing period. Each $1.00 fee is split: Stripe $" + DEFAULT_SHARES.stripeFee.toFixed(2) + ", PipeDream $" + PLATFORM_SHARE_AMOUNT.toFixed(2) + ", Recipient $" + RECIPIENT_SHARE_AMOUNT.toFixed(2) + ".",
      },
    });
  } catch (error) {
    console.error("Error fetching fee summary:", error);
    res.status(500).json({ success: false, error: "Failed to fetch fee summary" });
  }
});

/**
 * GET /v1/messaging/fees/check/:recipientId
 * Check if a fee will apply for messaging a specific user
 */
router.get("/fees/check/:recipientId", verifyToken, async (req: Request, res: Response) => {
  try {
    const senderId = (req as any).userId;
    const { recipientId } = req.params;

    // Determine if the sender is the responder in this conversation
    const conversationId = `${[senderId, recipientId].sort().join("-")}`;
    const firstMessage = await getMessageRepo().findOne({
      where: { conversationId },
      order: { createdAt: "ASC" },
    });
    const isResponder = firstMessage ? firstMessage.senderId !== senderId : false;

    // Check waiver FROM recipient TO sender (they waived fees for us messaging them)
    const waiverFromThem = await getWaiverRepo().findOne({
      where: { grantedByUserId: recipientId, grantedToUserId: senderId, active: true },
    });

    // Check waiver FROM sender TO recipient (we waived fees for them messaging us)
    const waiverFromMe = await getWaiverRepo().findOne({
      where: { grantedByUserId: senderId, grantedToUserId: recipientId, active: true },
    });

    // Has the responder actually replied in this conversation?
    const initiatorId = firstMessage ? firstMessage.senderId : senderId;
    const responderId = firstMessage ? (firstMessage.senderId === senderId ? recipientId : senderId) : recipientId;
    const responderHasReplied = await getMessageRepo().findOne({
      where: { conversationId, senderId: responderId },
    });

    const isFree = !!waiverFromThem || isResponder;

    res.json({
      success: true,
      feeApplies: !isFree,
      feeAmount: isFree ? "0.00" : MESSAGE_FEE.toFixed(2),
      platformShare: isFree ? "0.00" : PLATFORM_SHARE_AMOUNT.toFixed(2),
      recipientShare: isFree ? "0.00" : RECIPIENT_SHARE_AMOUNT.toFixed(2),
      waived: !!waiverFromThem,
      isResponder,
      grantedWaiverToThem: !!waiverFromMe,
      responderHasReplied: !!responderHasReplied,
      note: isResponder
        ? (waiverFromMe
            ? "Replies are free. You've waived fees for this user — they also message for free."
            : "Replies are free — only the initiator pays messaging fees.")
        : waiverFromThem
          ? "This recipient has waived messaging fees for you."
          : `A $${MESSAGE_FEE.toFixed(2)} fee will be charged per message. Fees are billed at the end of each 24-hour period.`,
    });
  } catch (error) {
    console.error("Error checking fee:", error);
    res.status(500).json({ success: false, error: "Failed to check fee" });
  }
});

/**
 * POST /v1/messaging/waivers/grant
 * Grant a messaging fee waiver to a user (designer/provider waives fees for a contact)
 */
router.post("/waivers/grant", verifyToken, async (req: Request, res: Response) => {
  try {
    const grantedByUserId = (req as any).userId;
    const { userId: grantedToUserId } = req.body;

    if (!grantedToUserId) {
      return res.status(400).json({ success: false, error: "userId is required" });
    }

    if (grantedByUserId === grantedToUserId) {
      return res.status(400).json({ success: false, error: "Cannot waive fees for yourself" });
    }

    // Check if waiver already exists
    const existing = await getWaiverRepo().findOne({
      where: { grantedByUserId, grantedToUserId },
    });

    if (existing && existing.active) {
      return res.json({ success: true, message: "Fee waiver already active", waiver: existing });
    }

    if (existing && !existing.active) {
      // Reactivate
      existing.active = true;
      existing.revokedAt = null as any;
      await getWaiverRepo().save(existing);
      return res.json({ success: true, message: "Fee waiver reactivated", waiver: existing });
    }

    // Create new waiver
    const waiver = getWaiverRepo().create({ grantedByUserId, grantedToUserId, active: true });
    await getWaiverRepo().save(waiver);

    res.status(201).json({ success: true, message: "Fee waiver granted", waiver });
  } catch (error) {
    console.error("Error granting waiver:", error);
    res.status(500).json({ success: false, error: "Failed to grant waiver" });
  }
});

/**
 * POST /v1/messaging/waivers/revoke
 * Revoke a messaging fee waiver
 */
router.post("/waivers/revoke", verifyToken, async (req: Request, res: Response) => {
  try {
    const grantedByUserId = (req as any).userId;
    const { userId: grantedToUserId } = req.body;

    if (!grantedToUserId) {
      return res.status(400).json({ success: false, error: "userId is required" });
    }

    const waiver = await getWaiverRepo().findOne({
      where: { grantedByUserId, grantedToUserId, active: true },
    });

    if (!waiver) {
      return res.status(404).json({ success: false, error: "No active waiver found" });
    }

    waiver.active = false;
    waiver.revokedAt = new Date();
    await getWaiverRepo().save(waiver);

    res.json({ success: true, message: "Fee waiver revoked" });
  } catch (error) {
    console.error("Error revoking waiver:", error);
    res.status(500).json({ success: false, error: "Failed to revoke waiver" });
  }
});

/**
 * GET /v1/messaging/waivers
 * List all waivers granted BY the current user (who am I giving free messaging to?)
 */
router.get("/waivers", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const waivers = await getWaiverRepo().find({
      where: { grantedByUserId: userId, active: true },
      relations: ["grantedToUser"],
    });

    res.json({
      success: true,
      waivers: waivers.map((w) => ({
        id: w.id,
        userId: w.grantedToUserId,
        userName: w.grantedToUser
          ? `${w.grantedToUser.firstName} ${w.grantedToUser.lastName}`.trim()
          : "Unknown",
        createdAt: w.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error listing waivers:", error);
    res.status(500).json({ success: false, error: "Failed to list waivers" });
  }
});

export default router;
