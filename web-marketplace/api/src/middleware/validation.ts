import Joi from "joi";
import { Request, Response, NextFunction } from "express";

/**
 * Express middleware factory — validates req.body against a Joi schema.
 * Returns 400 with structured error messages on validation failure.
 *
 * Usage:
 *   router.post("/register", validate(registerSchema), handler);
 */
export function validate(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,    // Collect all errors, not just the first
      stripUnknown: true,   // Remove fields not in the schema
      convert: true,        // Allow type coercion (e.g., string → number)
    });

    if (error) {
      const messages = error.details.map((d) => d.message);
      return res.status(400).json({
        error: "Validation failed",
        details: messages,
      });
    }

    // Replace body with the validated (and stripped) value
    req.body = value;
    next();
  };
}

/**
 * Validate query parameters (for GET endpoints with filters).
 */
export function validateQuery(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const messages = error.details.map((d) => d.message);
      return res.status(400).json({
        error: "Invalid query parameters",
        details: messages,
      });
    }

    (req as any).validatedQuery = value;
    next();
  };
}

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const registerSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().max(255)
    .messages({ "string.email": "A valid email address is required" }),
  password: Joi.string().min(8).max(128).required()
    .pattern(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.pattern.base": "Password must contain uppercase, lowercase, and a number",
    }),
  firstName: Joi.string().trim().min(1).max(100).optional(),
  lastName: Joi.string().trim().min(1).max(100).optional(),
  roles: Joi.array().items(
    Joi.string().valid("buyer", "designer", "producer", "service_provider", "author")
  ).min(1).max(5).required(),
  emailVerificationId: Joi.string().uuid().required()
    .messages({ "any.required": "Email verification is required before creating an account" }),
  stripeCustomerId: Joi.string().max(200).allow("", null).optional(),
  phone: Joi.string().max(20).allow("", null).optional(),
  businessName: Joi.string().max(200).allow("", null).optional(),
  businessType: Joi.string().max(50).allow("", null).optional(),
  description: Joi.string().max(2000).allow("", null).optional(),
  website: Joi.string().uri().max(500).allow("", null).optional(),
  address: Joi.string().max(300).allow("", null).optional(),
  city: Joi.string().max(100).allow("", null).optional(),
  state: Joi.string().max(100).allow("", null).optional(),
  zipCode: Joi.string().max(20).allow("", null).optional(),
  country: Joi.string().max(100).allow("", null).optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
  capabilities: Joi.array().items(Joi.string().max(100)).max(30).optional(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().max(255),
  password: Joi.string().required().max(128),
});

export const passwordResetRequestSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().max(255),
});

export const passwordResetSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required()
    .pattern(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.pattern.base": "Password must contain uppercase, lowercase, and a number",
    }),
});

export const emailVerifySchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().max(255),
  code: Joi.string().required().max(10),
});

// ============================================================================
// ORDER SCHEMAS
// ============================================================================

export const createOrderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().uuid().required(),
      quantity: Joi.number().integer().min(1).max(10000).required(),
      customizations: Joi.object().optional(),
    })
  ).min(1).max(100).required(),
  shippingAddressId: Joi.string().max(200).allow("", null).optional(),
  billingAddressId: Joi.string().max(200).allow("", null).optional(),
  notes: Joi.string().max(2000).allow("", null).optional(),
  preferredProducerId: Joi.string().uuid().allow("", null).optional(),
});

// ============================================================================
// PAYMENT SCHEMAS
// ============================================================================

export const createPaymentIntentSchema = Joi.object({
  orderId: Joi.string().uuid().required(),
});

export const setupIntentSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().max(255),
});

export const signupChargeSchema = Joi.object({
  paymentIntentId: Joi.string().required().max(200),
  email: Joi.string().email({ tlds: { allow: false } }).required().max(255),
});

// ============================================================================
// MESSAGING SCHEMAS
// ============================================================================

export const sendMessageSchema = Joi.object({
  recipientId: Joi.string().uuid().required(),
  subject: Joi.string().trim().min(1).max(200).required(),
  content: Joi.string().trim().min(1).max(10000).required(),
  conversationId: Joi.string().max(200).allow("", null).optional(),
});

// ============================================================================
// PRODUCT SCHEMAS
// ============================================================================

export const createProductSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().min(1).max(5000).required(),
  price: Joi.number().positive().max(1000000).required(),
  sku: Joi.string().trim().max(100).allow("", null).optional(),
  category: Joi.string().trim().max(100).required(),
  images: Joi.array().items(Joi.string().uri().max(500)).max(20).optional(),
  leadTime: Joi.number().integer().min(0).max(365).optional(),
  minBatchSize: Joi.number().integer().min(1).max(100000).optional(),
  maxBatchSize: Joi.number().integer().min(1).max(100000).optional(),
  manufacturingRequirements: Joi.string().max(5000).allow("", null).optional(),
  fulfillmentType: Joi.string().valid("self", "producer", "both").optional(),
  active: Joi.boolean().optional(),
});

// ============================================================================
// REPORT SCHEMAS
// ============================================================================

export const createReportSchema = Joi.object({
  category: Joi.string().required().max(100),
  description: Joi.string().trim().min(10).max(5000).required(),
  entityType: Joi.string().max(100).allow("", null).optional(),
  entityId: Joi.string().max(200).allow("", null).optional(),
  reportedUserId: Joi.string().uuid().allow("", null).optional(),
});

// ============================================================================
// BULLETIN BOARD SCHEMAS
// ============================================================================

export const createBulletinCardSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  content: Joi.string().trim().min(1).max(5000).required(),
  section: Joi.string().max(100).allow("", null).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  paymentIntentId: Joi.string().max(200).allow("", null).optional(),
});

// ============================================================================
// ADMIN SCHEMAS
// ============================================================================

export const bootstrapAdminSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().max(255),
  password: Joi.string().min(8).max(128).required(),
});
