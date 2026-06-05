// ============================================================================
// WebSocket Client — Real-time messaging & notifications via Socket.IO
// ============================================================================

/**
 * Manages a persistent WebSocket connection for real-time events.
 * Auto-connects when the user is authenticated, auto-reconnects on disconnect.
 */
const wsClient = (function () {
  let socket = null;
  let connected = false;

  /**
   * Connect to the WebSocket server.
   * Uses the httpOnly cookie for auth (sent automatically), plus a fallback
   * token from authService for environments where cookies aren't available.
   */
  function connect() {
    if (socket && connected) return; // Already connected

    // Socket.IO auto-serves client from /socket.io/socket.io.js
    if (typeof io === "undefined") {
      console.warn("Socket.IO client not loaded — real-time features disabled.");
      return;
    }

    const token =
      window.authService && window.authService.getToken
        ? window.authService.getToken()
        : null;

    socket = io({
      // VITE_API_BASE: empty in dev, /marketplace/api in prod (set in Railway dashboard)
      path: (import.meta.env.VITE_API_BASE || "") + "/socket.io",
      transports: ["websocket", "polling"],
      auth: token ? { token } : {},
      withCredentials: true, // Send cookies
    });

    socket.on("connect", () => {
      connected = true;
    });

    socket.on("disconnect", (reason) => {
      connected = false;
    });

    socket.on("connect_error", (err) => {
      console.warn("🔌 WebSocket auth error:", err.message);
      // Don't flood reconnect attempts if auth fails
      if (err.message === "Authentication required" || err.message === "Invalid token") {
        disconnect();
      }
    });

    // --- Real-time event handlers ---

    // New message received
    socket.on("new:message", (message) => {

      // If we're viewing this conversation, append the message
      if (typeof window.onRealtimeMessage === "function") {
        window.onRealtimeMessage(message);
      }

      // Show a subtle toast notification (if available)
      if (typeof showNotification === "function") {
        showNotification("New message", `From ${message.senderId}`);
      }
    });

    // New notification
    socket.on("new:notification", (notification) => {

      // Update notification badge count
      if (typeof window.onRealtimeNotification === "function") {
        window.onRealtimeNotification(notification);
      }
    });

    // Typing indicators
    socket.on("typing", (data) => {
      if (typeof window.onTypingIndicator === "function") {
        window.onTypingIndicator(data.userId, data.conversationId, true);
      }
    });

    socket.on("stop:typing", (data) => {
      if (typeof window.onTypingIndicator === "function") {
        window.onTypingIndicator(data.userId, data.conversationId, false);
      }
    });
  }

  /**
   * Disconnect and clean up.
   */
  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
      connected = false;
    }
  }

  /**
   * Join a conversation room (to receive typing indicators & messages).
   */
  function joinConversation(conversationId) {
    if (socket && connected) {
      socket.emit("join:conversation", conversationId);
    }
  }

  /**
   * Leave a conversation room.
   */
  function leaveConversation(conversationId) {
    if (socket && connected) {
      socket.emit("leave:conversation", conversationId);
    }
  }

  /**
   * Emit typing indicator.
   */
  function sendTyping(conversationId) {
    if (socket && connected) {
      socket.emit("typing", { conversationId });
    }
  }

  /**
   * Emit stop-typing indicator.
   */
  function sendStopTyping(conversationId) {
    if (socket && connected) {
      socket.emit("stop:typing", { conversationId });
    }
  }

  /**
   * Check if WebSocket is currently connected.
   */
  function isConnected() {
    return connected;
  }

  return {
    connect,
    disconnect,
    joinConversation,
    leaveConversation,
    sendTyping,
    sendStopTyping,
    isConnected,
  };
})();

// Expose globally
if (typeof window !== "undefined") {
  window.wsClient = wsClient;
}
