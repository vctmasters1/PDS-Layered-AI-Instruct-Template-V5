import "dotenv/config";

export const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET environment variable is not set in production");
  }
  return secret || "dev-secret-change-in-production";
})();

export const COOKIE_NAME = process.env.COOKIE_NAME || "pds_token";
