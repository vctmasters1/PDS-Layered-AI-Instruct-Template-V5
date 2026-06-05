import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../database.js";
import { User } from "../entities/user.js";

// Optional secondary allowlist: PDS_ADMIN_IDS=uuid1,uuid2 in env
// Provides defense-in-depth: even if the Marketplace DB isStaff flag is compromised,
// the hardcoded allowlist gates FwServer admin access independently.
const PDS_ADMIN_IDS = process.env.PDS_ADMIN_IDS
  ? new Set(process.env.PDS_ADMIN_IDS.split(",").map((id) => id.trim()).filter(Boolean))
  : null;

/**
 * Requires the authenticated user to be a PDS staff member (isStaff = true).
 * If PDS_ADMIN_IDS env var is set, user must ALSO appear in that allowlist.
 * Must be chained after verifyToken.
 */
export const adminOnly = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = (req as any).userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Check allowlist first (fast path, no DB hit required)
  if (PDS_ADMIN_IDS && !PDS_ADMIN_IDS.has(userId)) {
    res.status(403).json({ error: "Staff access required" });
    return;
  }

  try {
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: userId },
    });
    if (!user?.isStaff) {
      res.status(403).json({ error: "Staff access required" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Authorization check failed" });
  }
};
