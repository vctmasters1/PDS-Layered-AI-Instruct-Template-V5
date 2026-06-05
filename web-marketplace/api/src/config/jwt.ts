/**
 * Shared JWT configuration.
 * Single source of truth for JWT_SECRET across auth routes and WebSocket.
 * Throws in production if not set — prevents using weak default.
 */

export const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET environment variable is not set in production");
  }
  return secret || "dev-secret-key-change-in-production";
})();

export const TOKEN_EXPIRY = "7d";
export const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
export const COOKIE_NAME = "pds_token";

export const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: COOKIE_MAX_AGE,
  path: "/",
});
