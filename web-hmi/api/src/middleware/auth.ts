import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, COOKIE_NAME } from "../config/jwt.js";
import AppDataSource from "../database.js";
import { Device } from "../entities/device.js";

/**
 * Standalone JWT verification middleware for the Devices service.
 * Accepts tokens from the Authorization header (Bearer) or the httpOnly cookie.
 * Uses the same JWT_SECRET as the Marketplace service — tokens are interoperable.
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

/**
 * Device firmware authentication middleware.
 * Checks X-Device-Token header against the deviceToken column on the Device entity.
 * Sets req.authenticatedDevice on success.
 */
export const verifyDeviceToken = async (req: Request, res: Response, next: any): Promise<void> => {
  const token = req.headers["x-device-token"] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "No device token provided" });
    return;
  }

  try {
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { deviceToken: token } });
    if (!device) {
      res.status(401).json({ error: "Invalid device token" });
      return;
    }
    (req as any).authenticatedDevice = device;
    next();
  } catch {
    res.status(500).json({ error: "Auth error" });
  }
};

/**
 * Combined middleware: accepts either a device token (X-Device-Token header)
 * or a user JWT (Authorization / cookie). Used on endpoints callable by both
 * the physical device firmware and the browser HMI.
 *
 * Sets req.authenticatedDevice (device path) or req.userId (user path).
 */
export const verifyTokenOrDeviceToken = async (req: Request, res: Response, next: any): Promise<void> => {
  const deviceToken = req.headers["x-device-token"] as string | undefined;

  if (deviceToken) {
    // Device firmware path
    try {
      const deviceRepo = AppDataSource.getRepository(Device);
      const device = await deviceRepo.findOne({ where: { deviceToken } });
      if (!device) {
        res.status(401).json({ error: "Invalid device token" });
        return;
      }
      (req as any).authenticatedDevice = device;
      next();
    } catch {
      res.status(500).json({ error: "Auth error" });
    }
    return;
  }

  // User JWT path
  const jwtToken =
    req.headers.authorization?.split(" ")[1] ||
    (req as any).cookies?.[COOKIE_NAME];

  if (!jwtToken) {
    res.status(401).json({ error: "No authentication provided" });
    return;
  }

  try {
    const decoded = jwt.verify(jwtToken, JWT_SECRET) as { userId: string };
    (req as any).userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};
