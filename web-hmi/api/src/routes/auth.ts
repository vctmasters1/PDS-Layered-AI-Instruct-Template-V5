import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import AppDataSource from "../database.js";
import { User } from "../entities/user.js";
import { JWT_SECRET, COOKIE_NAME } from "../config/jwt.js";

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: COOKIE_MAX_AGE,
  path: "/",
});

const router = Router();

// ─── GET /v1/auth/me ──────────────────────────────────────────────────────────
// Returns the current user for the supplied JWT (Authorization header or cookie).
// Used by the React frontend on load to restore session.

router.get("/me", async (req: Request, res: Response): Promise<void> => {
  const token =
    req.headers.authorization?.split(" ")[1] ||
    (req as any).cookies?.[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: decoded.userId },
    });
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    res.json({ id: user.id, email: user.email, role: user.role, isStaff: user.isStaff });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// ─── POST /v1/auth/login ──────────────────────────────────────────────────────
// Body: { email: string, password: string }
// Issues httpOnly cookie + returns user object.

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    // password column has select: false — must be explicitly selected
    const user = await AppDataSource.getRepository(User)
      .createQueryBuilder("u")
      .addSelect("u.password")
      .where("u.email = :email", { email: (email as string).toLowerCase().trim() })
      .getOne();

    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie(COOKIE_NAME, token, getCookieOptions());
    res.json({ id: user.id, email: user.email, role: user.role, isStaff: user.isStaff });
  } catch (err: any) {
    console.error("POST /auth/login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── POST /v1/auth/logout ─────────────────────────────────────────────────────

router.post("/logout", (_req: Request, res: Response): void => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

export default router;
