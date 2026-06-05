import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Application, Request, Response, NextFunction } from "express";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

export function applySecurityMiddleware(app: Application): void {
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(limiter);

  // Redirect HTTP → HTTPS in production
  if (process.env.NODE_ENV === "production") {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.headers["x-forwarded-proto"] !== "https") {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      next();
    });
  }
}
