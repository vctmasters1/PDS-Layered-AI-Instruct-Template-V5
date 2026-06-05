import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, COOKIE_NAME } from "../config/jwt.js";

/**
 * Verifies the JWT from Authorization header (Bearer) or httpOnly cookie.
 * Uses the same JWT_SECRET as the Marketplace — tokens are interoperable.
 */
export const verifyToken = (req: Request, res: Response, next: any): void => {
  const token =
    req.headers.authorization?.split(" ")[1] ||
    (req as any).cookies?.[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    (req as any).userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};
