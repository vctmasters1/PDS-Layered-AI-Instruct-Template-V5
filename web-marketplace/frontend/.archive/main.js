// ============================================================================
// main.js — Vite entry point
// Imports all modules in dependency order, matching the original <script> load order.
// Each module attaches its exports to `window` for HTML event handler compat.
// ============================================================================

// CSS is loaded via <link rel="stylesheet"> in index.html — no import needed
// (import "./styles.css" is only valid inside a Vite build pipeline)

// --- Core modules (order matters) ---
import "./js/auth.js";   // AuthService singleton → window.authService
import "./js/theme.js";  // Theme toggle → window.initializeTheme, window.toggleTheme
import "./js/data.js";   // Data arrays + API fetch functions → window.products, window.designers, etc.
import "./js/utils.js";  // Shared helpers → window.escapeHtml etc.
import "./js/websocket.js"; // WS client → window.wsClient

// --- Feature modules ---
import "./js/search.js";        // Search functions + searchModule
import "./js/render.js";        // Product/designer/producer rendering
import "./js/ui.js";            // UI helpers, map, sections
import "./js/cart.js";          // Cart + checkout
import "./js/products.js";      // Product management (productsModule)
import "./js/producer-queue.js"; // Producer queue (producerQueueModule)
import "./js/messaging.js";     // Messaging (messagingModule)
import "./js/notifications.js"; // Notifications (notificationsModule)
import "./js/admin.js";         // Admin panel (adminModule)
import "./js/bulletin-board.js"; // Bulletin Board (community cards)

// --- Main app coordinator (must be last) ---
import "./app.js";

// --- Initialization (runs after all modules are loaded) ---
// Module scripts are deferred, so DOM is ready when this executes.
document.addEventListener("DOMContentLoaded", () => {
  // Full theme initialization (toggle listeners, system theme watch)
  if (typeof initializeTheme === "function") initializeTheme();
  if (typeof watchSystemTheme === "function") watchSystemTheme();

  // App initialization
  if (typeof initializeCart === "function") initializeCart();
  if (typeof renderNewsletter === "function") renderNewsletter();
  if (typeof showMissionStatementModal === "function") showMissionStatementModal(true);
});
