import helmet from "helmet";
import rateLimit from "express-rate-limit";
import express, { Request, Response, NextFunction } from "express";

/**
 * Security Middleware for Production
 * Implements:
 * - Helmet for secure HTTP headers
 * - Rate limiting for DDoS protection
 * - Request validation
 */

// Apply Helmet for security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://js.stripe.com", "https://static.cloudflareinsights.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://nominatim.openstreetmap.org", "https://*.tile.openstreetmap.org", "https://cdn.jsdelivr.net", "wss://pds-marketplace-production.up.railway.app", "wss://marketplace.pipedreamsystems.com", "ws://localhost:*"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      fontSrc: ["'self'", "https:", "data:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: "deny" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

// Helper to safely get client IP (works with Railway and proxies)
const getClientIp = (req:any) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    'unknown'
  ).trim();
};

const NODE_ENV = process.env.NODE_ENV || "development";

// General API rate limiter
// Higher limit in dev/test for automated testing (API + E2E suites combined)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === "production" ? 600 : 2000, // SPA makes ~5 calls per user action; 300 was too tight
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  skip: (req) => {
    return req.path === "/health";
  },
});

// Strict rate limiter for auth endpoints
// More lenient in dev/test to allow automated testing
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === "production" ? 15 : 5000, // strict in prod, lenient in dev/test
  message: "Too many requests, please try again later.",
  skipSuccessfulRequests: NODE_ENV === "production", // only skip successful in prod
  keyGenerator: (req) => getClientIp(req),
});

// Rate limiter for order creation (prevent spam)
export const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP/user to 20 orders per hour
  message: "You have created too many orders. Please try again later.",
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    return (req as any).userId || getClientIp(req);
  },
});

// Rate limiter for message sending (prevent spam)
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 messages per minute per user
  message: "You are sending messages too quickly. Please slow down.",
  keyGenerator: (req) => (req as any).userId || getClientIp(req),
});

// Rate limiter for review submission
export const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 reviews per hour per user
  message: "You have submitted too many reviews. Please try again later.",
  keyGenerator: (req) => (req as any).userId || getClientIp(req),
});

// Request validation middleware
export const validateContentType = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (
    req.method !== "GET" &&
    req.method !== "DELETE" &&
    req.method !== "HEAD"
  ) {
    // Skip content-type check for file uploads and Stripe webhooks
    if (
      req.path.startsWith("/v1/uploads") ||
      req.path.startsWith("/v1/payments/webhook")
    ) {
      return next();
    }
    const contentType = req.get("Content-Type");
    if (!contentType || !contentType.includes("application/json")) {
      return res.status(415).json({
        error: "Unsupported Media Type",
        message: "Content-Type must be application/json",
      });
    }
  }
  next();
};

// Request size limiter
export const requestSizeLimit = (maxSize: string = "10kb") => {
  return express.json({ limit: maxSize });
};

// HTTPS redirect middleware (for production)
export const httpsRedirect = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (process.env.NODE_ENV === "production") {
    if (req.header("x-forwarded-proto") !== "https") {
      return res.redirect(301, `https://${req.header("host")}${req.url}`);
    }
  }
  next();
};

// Security logging middleware
export const securityLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log suspicious URL patterns only (not body content which may contain legitimate text)
  const suspiciousUrlPatterns = [
    /(\.\.\/|\.\.\\)/i, // Path traversal in URL
    /__proto__|constructor\.prototype/i, // Prototype pollution in URL
  ];

  const suspiciousBodyPatterns = [
    /<script[\s>]/i, // Script tags in body
    /javascript\s*:/i, // javascript: protocol in body
    /\bon(error|load|click|mouseover)\s*=/i, // Event handlers in body
    /union\s+(all\s+)?select\s/i, // SQL injection
    /insert\s+into\s/i, // SQL injection
    /drop\s+table\s/i, // SQL injection
  ];

  const urlString = `${req.method} ${req.path} ${JSON.stringify(req.query)}`;
  const bodyString = JSON.stringify(req.body || {});

  for (const pattern of suspiciousUrlPatterns) {
    if (pattern.test(urlString)) {
      console.warn(`[SECURITY] Suspicious URL pattern from ${req.ip}:`, {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
      return res.status(400).json({ error: "Invalid request" });
    }
  }

  for (const pattern of suspiciousBodyPatterns) {
    if (pattern.test(bodyString)) {
      console.warn(`[SECURITY] Suspicious body content from ${req.ip}:`, {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
      return res.status(400).json({ error: "Invalid request content" });
    }
  }

  next();
};
