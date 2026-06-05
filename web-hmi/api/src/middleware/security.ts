import helmet from "helmet";
import rateLimit from "express-rate-limit";
import express, { Request, Response, NextFunction } from "express";

const NODE_ENV = process.env.NODE_ENV || "development";

// Helmet security headers — CSP tuned for the device configuration UI
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: [
        "'self'",
        "ws://localhost:*",
        `wss://${process.env.DEVICES_HOST || "pipedreamsystems.com"}`,
      ],
      frameSrc: ["'none'"],
      fontSrc: ["'self'", "data:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: "deny" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

const getClientIp = (req: any): string =>
  (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.headers["x-real-ip"] ||
    req.ip ||
    "unknown"
  ).trim();

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === "production" ? 300 : 2000,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  // Exempt health checks and all device-token authenticated requests (telemetry,
  // pending-sync, ota/ack, device-download) — these are high-frequency device ops.
  skip: (req) => req.path === "/health" || !!req.headers["x-device-token"],
});

// Tight limiter for login/register — prevents brute-force credential attacks
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === "production" ? 10 : 100,
  message: "Too many authentication attempts from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
});

export const validateContentType = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.method !== "GET" && req.method !== "DELETE" && req.method !== "HEAD") {
    const contentType = req.get("Content-Type");
    if (!contentType || !contentType.includes("application/json")) {
      res.status(415).json({ error: "Content-Type must be application/json" });
      return;
    }
  }
  next();
};

export const httpsRedirect = (req: Request, res: Response, next: NextFunction): void => {
  if (NODE_ENV === "production" && req.header("x-forwarded-proto") !== "https") {
    res.redirect(301, `https://${req.header("host")}${req.url}`);
    return;
  }
  next();
};

export const securityLogger = (req: Request, res: Response, next: NextFunction): void => {
  const suspiciousUrlPatterns = [/(\.\.\/|\.\.\\)/i, /__proto__|constructor\.prototype/i];
  const suspiciousBodyPatterns = [
    /<script[\s>]/i,
    /javascript\s*:/i,
    /\bon(error|load|click|mouseover)\s*=/i,
    /union\s+(all\s+)?select\s/i,
    /insert\s+into\s/i,
    /drop\s+table\s/i,
  ];

  const urlString = `${req.method} ${req.path} ${JSON.stringify(req.query)}`;
  const bodyString = JSON.stringify(req.body || {});

  for (const pattern of suspiciousUrlPatterns) {
    if (pattern.test(urlString)) {
      console.warn(`[SECURITY] Suspicious URL from ${req.ip}:`, req.path);
      res.status(400).json({ error: "Invalid request" });
      return;
    }
  }
  for (const pattern of suspiciousBodyPatterns) {
    if (pattern.test(bodyString)) {
      console.warn(`[SECURITY] Suspicious body from ${req.ip}:`, req.path);
      res.status(400).json({ error: "Invalid request content" });
      return;
    }
  }

  next();
};
