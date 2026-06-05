/**
 * Shared JWT configuration for the Devices service.
 * Must use the same JWT_SECRET as the Marketplace service so tokens are valid across both.
 */

export const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET environment variable is not set in production");
  }
  return secret || "dev-secret-key-change-in-production";
})();

export const COOKIE_NAME = "pds_token";
