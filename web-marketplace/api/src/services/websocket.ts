import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import { JWT_SECRET, COOKIE_NAME } from "../config/jwt.js";
import AppDataSource from "../database.js";
import { Message } from "../entities/message.js";

let io: Server | null = null;

// Map of userId → Set of socket IDs (a user may have multiple tabs/devices)
const userSockets = new Map<string, Set<string>>();

/**
 * Initialize Socket.IO server and attach to the HTTP server.
 * Called once from index.ts during startup.
 */
export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? [
              "https://pds-marketplace-production.up.railway.app",
              "https://marketplace.pipedreamsystems.com",
            ]
          : true,
      credentials: true,
    },
    // Only use WebSocket transport (skip long-polling for Railway compatibility)
    transports: ["websocket", "polling"],
  });

  // Authentication middleware — verify JWT before allowing connection
  io.use((socket, next) => {
    try {
      // Try auth from handshake query token, then Authorization header, then cookie
      let token: string | undefined;

      // 1. Explicit token in query string (sent by Socket.IO client)
      if (socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
      }

      // 2. Authorization header
      if (!token && socket.handshake.headers.authorization) {
        token = socket.handshake.headers.authorization.split(" ")[1];
      }

      // 3. httpOnly cookie
      if (!token && socket.handshake.headers.cookie) {
        const cookies = cookie.parse(socket.handshake.headers.cookie);
        token = cookies[COOKIE_NAME];
      }

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      (socket as any).userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  // Connection handler
  io.on("connection", (socket: Socket) => {
    const userId = (socket as any).userId as string;

    // Track this socket for the user
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    // Join a personal room for targeted messaging
    socket.join(`user:${userId}`);

    console.log(`🔌 WS connected: user=${userId} socket=${socket.id}`);

    // Handle disconnect
    socket.on("disconnect", () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
      console.log(`🔌 WS disconnected: user=${userId} socket=${socket.id}`);
    });

    // Client can join a conversation room to get typing indicators etc.
    // SECURITY: Verify the user is actually a participant in this conversation
    socket.on("join:conversation", async (conversationId: string) => {
      try {
        if (!AppDataSource.isInitialized) {
          socket.emit("error", { message: "Server not ready" });
          return;
        }
        const messageRepo = AppDataSource.getRepository(Message);
        const participantCheck = await messageRepo
          .createQueryBuilder("m")
          .where("m.conversationId = :conversationId", { conversationId })
          .andWhere("(m.senderId = :userId OR m.recipientId = :userId)", { userId })
          .limit(1)
          .getCount();

        if (participantCheck === 0) {
          socket.emit("error", { message: "Not authorized for this conversation" });
          return;
        }
        socket.join(`conversation:${conversationId}`);
      } catch (err) {
        console.error("join:conversation auth check error:", err);
        socket.emit("error", { message: "Failed to join conversation" });
      }
    });

    socket.on("leave:conversation", (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Typing indicator
    socket.on("typing", (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit("typing", {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on("stop:typing", (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit("stop:typing", {
        userId,
        conversationId: data.conversationId,
      });
    });
  });

  console.log("🔌 WebSocket server initialized");
  return io;
}

/**
 * Get the Socket.IO server instance.
 * Returns null if not initialized yet.
 */
export function getIO(): Server | null {
  return io;
}

/**
 * Check if a user is currently online (has at least one connected socket).
 */
export function isUserOnline(userId: string): boolean {
  return userSockets.has(userId) && userSockets.get(userId)!.size > 0;
}

/**
 * Emit a new-message event to a specific user's room.
 * Called from messaging.ts after a message is saved.
 */
export function emitNewMessage(
  recipientId: string,
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    recipientId: string;
    subject: string;
    content: string;
    createdAt: Date;
  }
): void {
  if (!io) return;
  io.to(`user:${recipientId}`).emit("new:message", message);
  // Also emit to the conversation room (for sender's other tabs)
  io.to(`conversation:${message.conversationId}`).emit("new:message", message);
}

/**
 * Emit a notification event to a specific user.
 * Called from notificationService after creating a notification.
 */
export function emitNotification(
  userId: string,
  notification: { id: string; type: string; title: string; body?: string }
): void {
  if (!io) return;
  io.to(`user:${userId}`).emit("new:notification", notification);
}
