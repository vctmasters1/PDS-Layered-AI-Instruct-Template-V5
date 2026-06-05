import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/**
 * Middleware to validate account_id from authentication context.
 */
export const validateAccountId = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.split(" ")[1] || (req as any).cookies?.["pds_token"];
  
  if (!token) {
    res.status(401).json({ error: "No authentication token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_secret") as { userId: string; accountId?: string };
    
    if (!decoded.accountId && !decoded.userId) {
      res.status(403).json({ error: "Invalid token: missing account context" });
      return;
    }

    (req as any).accountId = decoded.accountId || decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const requireAccountIdParam = (req: Request, res: Response, next: NextFunction): void => {
  const { account_id } = req.params || req.query || req.body;

  if (!account_id) {
    res.status(400).json({ error: "account_id is required" });
    return;
  }

  (req as any).accountId = String(account_id);
  next();
};

export const getCurrentAccountContext = (req: Request): { accountId: string; userId?: string } => {
  const accountId = (req as any).accountId;
  if (!accountId) throw new Error("No account context available in request");
  
  return { accountId, userId: (req as any).userId };
};
