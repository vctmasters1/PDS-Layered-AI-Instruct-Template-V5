import { Request, Response, NextFunction } from "express";

/**
 * Testing/Dev Access Control Middleware
 *
 * When TESTING_MODE is enabled, only allows access with a valid TEST_ACCESS_TOKEN.
 * This restricts preview access during testing to only those with the shared URL/token.
 *
 * Environment Variables:
 * - TESTING_MODE: Set to "true" to enable access restrictions
 * - TEST_ACCESS_TOKEN: Shared token for accessing the site during testing
 *
 * Usage:
 * - Query Parameter: /api/test?access=YOUR_TOKEN
 * - Authorization Header: Authorization: Bearer YOUR_TOKEN
 * - Cookie: testAccess=YOUR_TOKEN
 */

export const testingAccessControl = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Only enforce if testing mode is enabled
  if (process.env.TESTING_MODE !== "true") {
    return next();
  }

  const testToken = process.env.TEST_ACCESS_TOKEN;
  if (!testToken) {
    console.warn(
      "TESTING_MODE enabled but TEST_ACCESS_TOKEN not set. Access denied for all requests."
    );
    return res.status(403).json({
      error: "Access restricted during testing phase. Contact admin for access.",
    });
  }

  // Check for access token in multiple locations
  const accessToken =
    // Query parameter: ?access=token
    req.query.access ||
    // Authorization header: Authorization: Bearer token
    req.headers.authorization?.replace("Bearer ", "") ||
    // Cookie: testAccess=token
    (req.cookies && req.cookies.testAccess) ||
    null;

  if (!accessToken || accessToken !== testToken) {
    return res.status(403).json({
      error: "Access restricted. Invalid or missing access token.",
      hint: "Add ?access=TOKEN to URL or include token in Authorization header",
    });
  }

  // Token is valid, allow access
  next();
};

/**
 * Whitelist service routes from access control
 * These routes should be accessible without authentication
 */
export const testingAccessWhitelist = (whitelist: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Use exact match for "/" to avoid matching all paths via startsWith
    if (whitelist.some((path) => path === "/" ? req.path === "/" : req.path.startsWith(path))) {
      return next(); // Skip access control for whitelisted paths
    }

    testingAccessControl(req, res, next);
  };
};
