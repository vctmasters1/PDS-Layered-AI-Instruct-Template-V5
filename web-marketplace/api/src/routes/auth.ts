import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import AppDataSource from "../database.js";
import { User, UserRole } from "../entities/user.js";
import { Designer } from "../entities/designer.js";
import { Producer } from "../entities/producer.js";
import { PasswordResetToken } from "../entities/password-reset-token.js";
import { EmailVerificationToken } from "../entities/email-verification-token.js";
import { LessThan } from "typeorm";
import crypto from "crypto";
import { emailService } from "../services/emailService.js";
import { geocodeZip, geocodeAddress } from "../services/geocode.js";
import { JWT_SECRET, TOKEN_EXPIRY, COOKIE_MAX_AGE, COOKIE_NAME, getCookieOptions } from "../config/jwt.js";
import { validate, registerSchema, loginSchema, passwordResetRequestSchema, passwordResetSchema, emailVerifySchema } from "../middleware/validation.js";
import stripe from "../config/stripe.js";

// Haversine distance in km between two lat/lng points
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MAX_PIN_OFFSET_KM = 40;

const router = Router();

// Middleware to verify JWT token — checks Authorization header first, then falls back to httpOnly cookie
export const verifyToken = (req: Request, res: Response, next: any) => {
  const token =
    req.headers.authorization?.split(" ")[1] ||
    req.cookies?.[COOKIE_NAME];
  
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    (req as any).userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Register (Create Account)
router.post("/register", validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, roles, stripeCustomerId, emailVerificationId, city, state, zipCode } = req.body;
    
    // Validate input
    if (!email || !password || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ 
        error: "Email, password, and at least one role are required" 
      });
    }

    // M5: Password strength validation
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: "Password must contain at least one uppercase letter" });
    }
    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ error: "Password must contain at least one lowercase letter" });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: "Password must contain at least one number" });
    }
    
    // Email must be verified before account creation
    if (!emailVerificationId) {
      return res.status(400).json({
        error: "Email verification is required before creating an account"
      });
    }

    // Validate the email verification token
    const emailTokenRepo = AppDataSource.getRepository(EmailVerificationToken);
    const emailToken = await emailTokenRepo.findOne({
      where: { id: emailVerificationId, email, verified: true },
    });
    if (!emailToken) {
      return res.status(400).json({
        error: "Invalid email verification. Please verify your email again."
      });
    }

    // Credit card verification is required for all accounts
    if (!stripeCustomerId) {
      return res.status(400).json({
        error: "A verified payment card is required to create an account"
      });
    }
    
    const userRepo = AppDataSource.getRepository(User);
    
    // Check if user already exists
    const existingUser = await userRepo.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "User with this email already exists" });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Map roles from frontend to backend roles
    const primaryRole = roles.includes("designer") ? UserRole.DESIGNER : 
                       roles.includes("producer") ? UserRole.PRODUCER :
                       roles.includes("service_provider") ? UserRole.SERVICE_PROVIDER :
                       roles.includes("author") ? UserRole.AUTHOR :
                       UserRole.BUYER;
    
    // Create user (email already verified in step 1)
    // Set active service flags based on selected roles so users appear in search immediately
    // Geocode ZIP to lat/lng for accurate map placement
    const userCity = (typeof city === 'string' && city.trim()) ? city.trim() : null;
    const userState = (typeof state === 'string' && state.trim()) ? state.trim() : null;
    const userZip = (typeof zipCode === 'string' && zipCode.trim()) ? zipCode.trim() : null;
    let userLatitude: number | null = null;
    let userLongitude: number | null = null;
    if (userZip) {
      try {
        const geo = await geocodeZip(userZip);
        if (geo) {
          userLatitude = geo.lat;
          userLongitude = geo.lng;
        }
      } catch (geoErr: any) {
        console.warn("Signup ZIP geocoding failed (non-blocking):", geoErr.message);
      }
    }
    const user = userRepo.create({
      id: uuidv4(),
      email,
      password: hashedPassword,
      firstName: firstName || "",
      lastName: lastName || "",
      role: primaryRole,
      emailVerified: true,
      active: true,
      stripeCustomerId: stripeCustomerId || null,
      activeDesigner: roles.includes("designer"),
      activeProducer: roles.includes("producer"),
      activeMaterials: roles.includes("service_provider"),
      activeAuthor: roles.includes("author"),
      activeGizmo: false,
      businessLatitude: userLatitude ?? undefined,
      businessLongitude: userLongitude ?? undefined,
      businessCity: userCity ?? undefined,
      businessState: userState ?? undefined,
      businessZip: userZip ?? undefined,
    });
    
    const savedUser = await userRepo.save(user);

    // Auto-create Designer/Producer entity records for selected roles
    if (roles.includes("designer")) {
      try {
        const designerRepo = AppDataSource.getRepository(Designer);
        const designer = designerRepo.create({
          user: savedUser,
          businessName: `${firstName || ""} ${lastName || ""}`.trim() || "My Design Studio",
          businessType: "creator" as any,
          location_address: "",
          location_city: savedUser.businessCity || "Unknown",
          location_state: savedUser.businessState || "Unknown",
          location_zipCode: savedUser.businessZip || "00000",
          location_country: "USA",
          location_latitude: savedUser.businessLatitude || 0,
          location_longitude: savedUser.businessLongitude || 0,
          active: true,
        });
        await designerRepo.save(designer);
      } catch (designerErr: any) {
        console.warn("Auto-create designer profile failed (non-fatal):", designerErr.message);
      }
    }
    if (roles.includes("producer")) {
      try {
        const producerRepo = AppDataSource.getRepository(Producer);
        const producer = producerRepo.create({
          user: savedUser,
          businessName: `${firstName || ""} ${lastName || ""}`.trim() || "My Production Shop",
          location_address: "",
          location_city: savedUser.businessCity || "Unknown",
          location_state: savedUser.businessState || "Unknown",
          location_zipCode: savedUser.businessZip || "00000",
          location_country: "USA",
          location_latitude: savedUser.businessLatitude || 0,
          location_longitude: savedUser.businessLongitude || 0,
          active: true,
        });
        await producerRepo.save(producer);
      } catch (producerErr: any) {
        console.warn("Auto-create producer profile failed (non-fatal):", producerErr.message);
      }
    }

    // Create signup fee invoice now that user record exists
    if (stripeCustomerId) {
      try {
        const { invoiceService } = await import("../services/invoiceService.js");
        const { InvoiceType } = await import("../entities/invoice.js");
        // Find the most recent succeeded PaymentIntent for this customer
        const paymentIntents = await stripe.paymentIntents.list({
          customer: stripeCustomerId,
          limit: 1,
        });
        const signupPi = paymentIntents.data.find(pi => pi.metadata?.purpose === "signup-verification" && pi.status === "succeeded");
        await invoiceService.createChargeInvoice({
          userId: savedUser.id,
          type: InvoiceType.SIGNUP_FEE,
          amount: 1.0,
          stripePaymentIntentId: signupPi?.id,
          description: "PipeDream Marketplace — Account verification fee",
          sourceEntityType: "signup",
          sourceEntityId: savedUser.id,
          metadata: { email, customerId: stripeCustomerId },
        });
      } catch (invoiceErr: any) {
        console.warn("Signup invoice creation failed (non-fatal):", invoiceErr.message);
      }
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: savedUser.id, email: savedUser.email },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
    
    // Set httpOnly cookie for secure token storage
    res.cookie(COOKIE_NAME, token, getCookieOptions());
    
    res.status(201).json({
      message: "Account created successfully",
      user: {
        id: savedUser.id,
        email: savedUser.email,
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
        role: savedUser.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
router.post("/login", validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    
    const userRepo = AppDataSource.getRepository(User);
    
    // Find user — must addSelect password since it has select:false in the entity
    const user = await userRepo.createQueryBuilder("user")
      .addSelect("user.password")
      .where("user.email = :email", { email })
      .getOne();
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    // Check if account is suspended
    if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
      return res.status(403).json({
        error: `Account suspended until ${new Date(user.suspendedUntil).toLocaleDateString()}`,
        reason: user.suspendedReason || "Policy violation",
        suspendedUntil: user.suspendedUntil,
      });
    }
    
    // Check if account is deactivated
    if (!user.active) {
      return res.status(403).json({ error: "Account is deactivated. Contact support." });
    }
    
    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
    
    // Set httpOnly cookie for secure token storage
    res.cookie(COOKIE_NAME, token, getCookieOptions());
    
    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isStaff: user.isStaff,
        deviceNetworkAccess: user.deviceNetworkAccess,
        propertyPortalAccess: user.propertyPortalAccess,
        resumeAccess: user.resumeAccess,
        isPropertyManager: user.isPropertyManager,
        isPropertyTenant: user.isPropertyTenant,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Logout — clear httpOnly cookie
router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ message: "Logged out successfully" });
});

// Get current user profile
router.get("/me", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const userRepo = AppDataSource.getRepository(User);
    
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        shippingName: user.shippingName,
        shippingStreet: user.shippingStreet,
        shippingCity: user.shippingCity,
        shippingState: user.shippingState,
        shippingZip: user.shippingZip,
        shippingCountry: user.shippingCountry,
        billingName: user.billingName,
        billingStreet: user.billingStreet,
        billingCity: user.billingCity,
        billingState: user.billingState,
        billingZip: user.billingZip,
        billingCountry: user.billingCountry,
        billingSameAsShipping: user.billingSameAsShipping,
        businessName: user.businessName,
        businessAddress: user.businessAddress,
        businessCity: user.businessCity,
        businessState: user.businessState,
        businessZip: user.businessZip,
        businessLatitude: user.businessLatitude,
        businessLongitude: user.businessLongitude,
        locationPrivate: user.locationPrivate ?? false,
        customPinLat: user.customPinLat ?? null,
        customPinLng: user.customPinLng ?? null,
        isStaff: user.isStaff,
        deviceNetworkAccess: user.deviceNetworkAccess,
        propertyPortalAccess: user.propertyPortalAccess,
        resumeAccess: user.resumeAccess,
        isPropertyManager: user.isPropertyManager,
        isPropertyTenant: user.isPropertyTenant,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Update user profile
router.put("/me", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { 
      firstName, 
      lastName, 
      displayName,
      phone,
      shippingName,
      shippingStreet,
      shippingCity,
      shippingState,
      shippingZip,
      shippingCountry,
      billingName,
      billingStreet,
      billingCity,
      billingState,
      billingZip,
      billingCountry,
      billingSameAsShipping,
      businessName,
      businessAddress,
      businessCity,
      businessState,
      businessZip,
      locationPrivate,
    } = req.body;
    
    const userRepo = AppDataSource.getRepository(User);
    
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Update allowed fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (displayName !== undefined) user.displayName = displayName;
    if (phone !== undefined) user.phone = phone;
    
    // Update shipping address
    if (shippingName !== undefined) user.shippingName = shippingName;
    if (shippingStreet !== undefined) user.shippingStreet = shippingStreet;
    if (shippingCity !== undefined) user.shippingCity = shippingCity;
    if (shippingState !== undefined) user.shippingState = shippingState;
    if (shippingZip !== undefined) user.shippingZip = shippingZip;
    if (shippingCountry !== undefined) user.shippingCountry = shippingCountry;
    
    // Update billing address
    if (billingSameAsShipping !== undefined) {
      user.billingSameAsShipping = billingSameAsShipping;
      
      if (billingSameAsShipping) {
        // Copy shipping to billing
        user.billingName = user.shippingName;
        user.billingStreet = user.shippingStreet;
        user.billingCity = user.shippingCity;
        user.billingState = user.shippingState;
        user.billingZip = user.shippingZip;
        user.billingCountry = user.shippingCountry;
      }
    }
    
    // Only update billing fields if not using "same as shipping" or explicitly provided
    if (!billingSameAsShipping || billingStreet !== undefined) {
      if (billingName !== undefined) user.billingName = billingName;
      if (billingStreet !== undefined) user.billingStreet = billingStreet;
      if (billingCity !== undefined) user.billingCity = billingCity;
      if (billingState !== undefined) user.billingState = billingState;
      if (billingZip !== undefined) user.billingZip = billingZip;
      if (billingCountry !== undefined) user.billingCountry = billingCountry;
    }
    
    // Update business identity
    if (businessName !== undefined) user.businessName = businessName;
    if (businessAddress !== undefined) user.businessAddress = businessAddress;
    if (businessCity !== undefined) user.businessCity = businessCity;
    if (businessState !== undefined) user.businessState = businessState;
    if (businessZip !== undefined) user.businessZip = businessZip;
    if (locationPrivate !== undefined) user.locationPrivate = Boolean(locationPrivate);
    
    // Auto-geocode to lat/lng — use full address for accuracy when available, fall back to ZIP
    if (businessZip !== undefined && businessZip) {
      try {
        let geo: { lat: number; lng: number; city: string; state: string } | null = null;
        if (businessAddress || user.businessAddress) {
          geo = await geocodeAddress(
            businessAddress || user.businessAddress || "",
            businessCity || user.businessCity || "",
            businessState || user.businessState || "",
            businessZip
          );
        } else {
          geo = await geocodeZip(businessZip);
        }
        if (geo) {
          user.businessLatitude = geo.lat;
          user.businessLongitude = geo.lng;
          // Auto-fill city/state from ZIP if not explicitly provided
          if (!businessCity && geo.city) user.businessCity = geo.city;
          if (!businessState && geo.state) user.businessState = geo.state;
          // If the user has a custom pin set, verify it's still within 40 km of the new address.
          // Reset it if the address moved too far — prevents the set-fake-pin-then-change-address exploit.
          if (user.customPinLat && user.customPinLng) {
            const dist = haversineKm(geo.lat, geo.lng, Number(user.customPinLat), Number(user.customPinLng));
            if (dist > MAX_PIN_OFFSET_KM) {
              user.customPinLat = null as any;
              user.customPinLng = null as any;
            }
          }
        }
      } catch (geoErr) {
        console.warn("Geocoding failed (non-blocking):", geoErr);
      }
    }
    
    const updated = await userRepo.save(user);
    
    // Propagate business identity + coordinates to existing service profiles
    if (businessName !== undefined || businessAddress !== undefined || businessCity !== undefined || businessState !== undefined || businessZip !== undefined) {
      const designerRepo = AppDataSource.getRepository(Designer);
      const producerRepo = AppDataSource.getRepository(Producer);
      
      const designer = await designerRepo.findOne({ where: { user: { id: userId } } });
      if (designer) {
        if (updated.businessName) designer.businessName = updated.businessName;
        if (updated.businessAddress !== undefined) designer.location_address = updated.businessAddress || "";
        if (updated.businessCity) designer.location_city = updated.businessCity;
        if (updated.businessState) designer.location_state = updated.businessState;
        if (updated.businessZip) designer.location_zipCode = updated.businessZip;
        if (updated.businessLatitude) designer.location_latitude = updated.businessLatitude;
        if (updated.businessLongitude) designer.location_longitude = updated.businessLongitude;
        await designerRepo.save(designer);
      }
      
      const producer = await producerRepo.findOne({ where: { user: { id: userId } } });
      if (producer) {
        if (updated.businessName) producer.businessName = updated.businessName;
        if (updated.businessAddress !== undefined) producer.location_address = updated.businessAddress || "";
        if (updated.businessCity) producer.location_city = updated.businessCity;
        if (updated.businessState) producer.location_state = updated.businessState;
        if (updated.businessZip) producer.location_zipCode = updated.businessZip;
        if (updated.businessLatitude) producer.location_latitude = updated.businessLatitude;
        if (updated.businessLongitude) producer.location_longitude = updated.businessLongitude;
        await producerRepo.save(producer);
      }
    }
    
    res.json({
      message: "Profile updated successfully",
      user: {
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        displayName: updated.displayName,
        phone: updated.phone,
        role: updated.role,
        shippingName: updated.shippingName,
        shippingStreet: updated.shippingStreet,
        shippingCity: updated.shippingCity,
        shippingState: updated.shippingState,
        shippingZip: updated.shippingZip,
        shippingCountry: updated.shippingCountry,
        billingName: updated.billingName,
        billingStreet: updated.billingStreet,
        billingCity: updated.billingCity,
        billingState: updated.billingState,
        billingZip: updated.billingZip,
        billingCountry: updated.billingCountry,
        billingSameAsShipping: updated.billingSameAsShipping,
        businessName: updated.businessName,
        businessAddress: updated.businessAddress,
        businessCity: updated.businessCity,
        businessState: updated.businessState,
        businessZip: updated.businessZip,
        businessLatitude: updated.businessLatitude,
        businessLongitude: updated.businessLongitude,
        locationPrivate: updated.locationPrivate ?? false,
        customPinLat: updated.customPinLat ?? null,
        customPinLng: updated.customPinLng ?? null,
      },
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Update user's custom map pin position (only active when locationPrivate = true)
// Pin must be within 40 km of the user's real business address.
router.put("/me/pin", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { lat, lng } = req.body;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "lat and lng must be numbers" });
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.businessLatitude || !user.businessLongitude) {
      return res.status(400).json({ error: "Set your address before placing a custom pin" });
    }

    const dist = haversineKm(Number(user.businessLatitude), Number(user.businessLongitude), lat, lng);
    if (dist > MAX_PIN_OFFSET_KM) {
      return res.status(400).json({ error: `Pin must be within ${MAX_PIN_OFFSET_KM} km of your real address (it is ${Math.round(dist)} km away)` });
    }

    user.customPinLat = lat;
    user.customPinLng = lng;
    const updated = await userRepo.save(user);

    res.json({ success: true, customPinLat: updated.customPinLat, customPinLng: updated.customPinLng });
  } catch (error) {
    console.error("Pin update error:", error);
    res.status(500).json({ error: "Failed to update pin" });
  }
});

// Also expose a DELETE to clear the custom pin (revert to auto-fuzz)
router.delete("/me/pin", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });
    user.customPinLat = null as any;
    user.customPinLng = null as any;
    await userRepo.save(user);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear pin" });
  }
});

// Update designer profile (capabilities, portfolio, etc.)
router.put("/me/designer", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { capabilities, specialties, experience, hourlyRate, bio } = req.body;

    const userRepo = AppDataSource.getRepository(User);
    const designerRepo = AppDataSource.getRepository(Designer);

    const user = await userRepo.findOne({ where: { id: userId }, relations: ["designerProfile"] });
    if (!user) return res.status(404).json({ error: "User not found" });

    let designer = user.designerProfile;
    if (!designer) {
      // Auto-create a designer profile seeded from User's business identity
      designer = designerRepo.create({
        user: user,
        businessName: user.businessName || `${user.firstName} ${user.lastName} Design`.trim() || 'My Design Studio',
        businessType: 'creator' as any,
        location_address: '',
        location_city: user.businessCity || 'Unknown',
        location_state: user.businessState || 'Unknown',
        location_zipCode: user.businessZip || '00000',
        location_country: 'USA',
        location_latitude: user.businessLatitude || 0,
        location_longitude: user.businessLongitude || 0,
        active: true,
      });
      designer = await designerRepo.save(designer);
    }
    // Store capabilities as comma-separated in website field as JSON note
    // Since designer entity doesn't have a capabilities column, store in description as JSON appendix
    if (capabilities !== undefined || specialties !== undefined || experience !== undefined || hourlyRate !== undefined) {
      const meta = {
        capabilities: capabilities || [],
        specialties: specialties || "",
        experience: experience || 0,
        hourlyRate: hourlyRate || 0,
      };
      // Store structured data in website field as JSON (or add to description)
      designer.website = JSON.stringify(meta);
    }
    if (bio !== undefined) designer.bio = bio;

    await designerRepo.save(designer);

    res.json({
      success: true,
      message: "Designer profile updated",
      designer: {
        id: designer.id,
        businessName: designer.businessName,
        capabilities: capabilities || [],
        website: designer.website,
      },
    });
  } catch (error) {
    console.error("Update designer profile error:", error);
    res.status(500).json({ error: "Failed to update designer profile" });
  }
});

// Update producer profile (capabilities, capacity, etc.)
router.put("/me/producer", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { specialties, capabilities, minBatch, capacity, leadTime, certifications, bio } = req.body;

    const userRepo = AppDataSource.getRepository(User);
    const producerRepo = AppDataSource.getRepository(Producer);

    const user = await userRepo.findOne({ where: { id: userId }, relations: ["producerProfile"] });
    if (!user) return res.status(404).json({ error: "User not found" });

    let producer = user.producerProfile;
    if (!producer) {
      // Auto-create a producer profile seeded from User's business identity
      producer = producerRepo.create({
        user: user,
        businessName: user.businessName || `${user.firstName} ${user.lastName} Production`.trim() || 'My Production Shop',
        location_address: '',
        location_city: user.businessCity || 'Unknown',
        location_state: user.businessState || 'Unknown',
        location_zipCode: user.businessZip || '00000',
        location_country: 'USA',
        location_latitude: user.businessLatitude || 0,
        location_longitude: user.businessLongitude || 0,
        active: true,
      });
      producer = await producerRepo.save(producer);
    }
    if (bio !== undefined) producer.bio = bio;
    if (capabilities !== undefined) producer.capabilities_materialTypes = capabilities;
    if (minBatch !== undefined) producer.capabilities_minBatchSize = minBatch;
    if (capacity !== undefined) producer.capabilities_maxCapacityPerMonth = parseInt(capacity) || 0;
    if (leadTime !== undefined) producer.averageLeadTime = leadTime;
    if (specialties !== undefined || certifications !== undefined) {
      producer.description = JSON.stringify({
        specialties: specialties || "",
        certifications: certifications || "",
      });
    }

    await producerRepo.save(producer);

    res.json({
      success: true,
      message: "Producer profile updated",
      producer: {
        id: producer.id,
        businessName: producer.businessName,
        capabilities: producer.capabilities_materialTypes,
        minBatch: producer.capabilities_minBatchSize,
        capacity: producer.capabilities_maxCapacityPerMonth,
        leadTime: producer.averageLeadTime,
      },
    });
  } catch (error) {
    console.error("Update producer profile error:", error);
    res.status(500).json({ error: "Failed to update producer profile" });
  }
});

// Get designer profile data
router.get("/me/designer", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId }, relations: ["designerProfile"] });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.designerProfile) return res.json({ success: true, designer: null });

    const d = user.designerProfile;
    let meta: any = {};
    try { meta = JSON.parse(d.website || "{}"); } catch {}

    res.json({
      success: true,
      designer: {
        id: d.id,
        businessName: d.businessName,
        city: d.location_city,
        state: d.location_state,
        bio: d.bio ?? "",
        capabilities: meta.capabilities || [],
        specialties: meta.specialties || "",
        experience: meta.experience || 0,
        hourlyRate: meta.hourlyRate || 0,
      },
    });
  } catch (error) {
    console.error("Get designer profile error:", error);
    res.status(500).json({ error: "Failed to fetch designer profile" });
  }
});

// Get producer profile data
router.get("/me/producer", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId }, relations: ["producerProfile"] });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.producerProfile) return res.json({ success: true, producer: null });

    const p = user.producerProfile;
    let meta: any = {};
    try { meta = JSON.parse(p.description || "{}"); } catch {}

    res.json({
      success: true,
      producer: {
        id: p.id,
        businessName: p.businessName,
        city: p.location_city,
        state: p.location_state,
        bio: p.bio ?? "",
        capabilities: p.capabilities_materialTypes || [],
        minBatch: p.capabilities_minBatchSize,
        capacity: p.capabilities_maxCapacityPerMonth,
        leadTime: p.averageLeadTime,
        specialties: meta.specialties || "",
        certifications: meta.certifications || "",
      },
    });
  } catch (error) {
    console.error("Get producer profile error:", error);
    res.status(500).json({ error: "Failed to fetch producer profile" });
  }
});

// Change password
router.post("/change-password", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords are required" });
    }

    // Password strength validation
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters long" });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: "New password must contain at least one uppercase letter" });
    }
    if (!/[a-z]/.test(newPassword)) {
      return res.status(400).json({ error: "New password must contain at least one lowercase letter" });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: "New password must contain at least one number" });
    }
    
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    
    // Hash and set new password
    user.password = await bcrypt.hash(newPassword, 10);
    await userRepo.save(user);
    
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// ============================================================================
// EMAIL VERIFICATION (Signup Step 1)
// ============================================================================

/**
 * POST /v1/auth/send-verification-code
 * Sends a 6-digit verification code to the provided email.
 * Must be called BEFORE registration to verify email ownership.
 */
router.post("/send-verification-code", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const userRepo = AppDataSource.getRepository(User);
    const tokenRepo = AppDataSource.getRepository(EmailVerificationToken);

    // Check if email is already registered
    const existingUser = await userRepo.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
    }

    // Invalidate any existing codes for this email
    await tokenRepo.update({ email, used: false, verified: false }, { used: true });

    // Generate 6-digit code using cryptographically secure random
    const code = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 min expiry

    const tokenRecord = new EmailVerificationToken();
    tokenRecord.email = email;
    tokenRecord.code = code;
    tokenRecord.expiresAt = expiresAt;
    tokenRecord.used = false;
    tokenRecord.verified = false;
    await tokenRepo.save(tokenRecord);

    // Cleanup expired tokens
    await tokenRepo.delete({ expiresAt: LessThan(new Date()) });

    await emailService.sendVerificationCode(email, code);

    res.json({
      message: "Verification code sent to your email.",
      // Include code in response during development/testing
      ...(process.env.NODE_ENV !== "production" ? { code } : {}),
    });
  } catch (error) {
    console.error("Send verification code error:", error);
    res.status(500).json({ error: "Failed to send verification code" });
  }
});

/**
 * POST /v1/auth/verify-email-code
 * Verifies a 6-digit code. Returns a verification token that must be
 * submitted with the final registration request.
 */
router.post("/verify-email-code", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: "Email and verification code are required" });
    }

    const tokenRepo = AppDataSource.getRepository(EmailVerificationToken);
    const tokenRecord = await tokenRepo.findOne({
      where: { email, code, used: false, verified: false },
    });

    if (!tokenRecord || new Date() > tokenRecord.expiresAt) {
      if (tokenRecord) {
        tokenRecord.used = true;
        await tokenRepo.save(tokenRecord);
      }
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    // Mark as verified
    tokenRecord.verified = true;
    tokenRecord.used = true;
    await tokenRepo.save(tokenRecord);

    // Return the token ID as proof of verification
    res.json({
      message: "Email verified successfully!",
      emailVerificationId: tokenRecord.id,
    });
  } catch (error) {
    console.error("Verify email code error:", error);
    res.status(500).json({ error: "Failed to verify code" });
  }
});

// ============================================================================
// PASSWORD RESET (Self-Service)
// ============================================================================

/**
 * POST /v1/auth/request-password-reset
 * Generate a password reset token (stored in database)
 */
router.post("/request-password-reset", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    const userRepo = AppDataSource.getRepository(User);
    const tokenRepo = AppDataSource.getRepository(PasswordResetToken);
    const user = await userRepo.findOne({ where: { email } });
    
    // Always return success (don't reveal if email exists)
    if (!user) {
      return res.json({ message: "If that email exists, a reset link has been sent." });
    }
    
    // Invalidate any existing tokens for this user
    await tokenRepo.update({ userId: user.id, used: false }, { used: true });
    
    // Generate reset token and store in DB
    const resetToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry
    
    const tokenRecord = new PasswordResetToken();
    tokenRecord.token = resetToken;
    tokenRecord.userId = user.id;
    tokenRecord.expiresAt = expiresAt;
    tokenRecord.used = false;
    await tokenRepo.save(tokenRecord);
    
    // Clean up expired tokens (housekeeping)
    await tokenRepo.delete({ expiresAt: LessThan(new Date()) });
    
    // In production: send email with reset link
    // For now, log the token (admin can see it in server logs)
    console.log(`🔑 Password reset token for ${email}: ${resetToken}`);
    await emailService.sendPasswordReset(email, resetToken);
    
    res.json({ 
      message: "If that email exists, a reset link has been sent.",
      // Include token in response during development/testing
      ...(process.env.NODE_ENV !== "production" ? { resetToken } : {}),
    });
  } catch (error) {
    console.error("Password reset request error:", error);
    res.status(500).json({ error: "Failed to process reset request" });
  }
});

/**
 * POST /v1/auth/reset-password
 * Reset password using a valid reset token
 */
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token: resetToken, newPassword } = req.body;
    
    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: "Reset token and new password are required" });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: "Password must contain at least one uppercase letter" });
    }
    if (!/[a-z]/.test(newPassword)) {
      return res.status(400).json({ error: "Password must contain at least one lowercase letter" });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: "Password must contain at least one number" });
    }
    
    const tokenRepo = AppDataSource.getRepository(PasswordResetToken);
    const tokenData = await tokenRepo.findOne({ where: { token: resetToken, used: false } });
    
    if (!tokenData || new Date() > tokenData.expiresAt) {
      if (tokenData) {
        tokenData.used = true;
        await tokenRepo.save(tokenData);
      }
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }
    
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: tokenData.userId } });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    user.password = await bcrypt.hash(newPassword, 10);
    await userRepo.save(user);
    
    // Mark the token as used (single-use)
    tokenData.used = true;
    await tokenRepo.save(tokenData);
    
    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// ============================================================================
// DEV/TEST ONLY: Promote user to admin (disabled in production)
// ============================================================================
if (process.env.NODE_ENV !== "production") {
  /**
   * POST /v1/auth/dev/promote-admin
   * Promotes a user to admin role + isStaff. Only available in dev/test environments.
   * Body: { userId }
   * Requires an existing valid JWT (verifyToken).
   */
  router.post("/dev/promote-admin", verifyToken, async (req: Request, res: Response) => {
    try {
      const requesterId = (req as any).userId;
      const { userId } = req.body;
      const targetId = userId || requesterId; // self-promote if no userId provided

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: targetId } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      user.role = UserRole.ADMIN;
      user.isStaff = true;
      await userRepo.save(user);

      res.json({
        success: true,
        message: `User ${user.email} promoted to admin (DEV ONLY)`,
      });
    } catch (error) {
      console.error("Dev promote-admin error:", error);
      res.status(500).json({ error: "Failed to promote user" });
    }
  });
}

/**
 * GET /v1/auth/me/registered-services
 * Retrieve the user's per-service active flags
 */
router.get(
  "/me/registered-services",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: "User not found" });

      res.json({
        success: true,
        services: {
          designer: user.activeDesigner,
          producer: user.activeProducer,
          materials: user.activeMaterials,
          author: user.activeAuthor,
          gizmo: user.activeGizmo,
        },
      });
    } catch (error) {
      console.error("Get registered services error:", error);
      res.status(500).json({ error: "Failed to fetch registered services" });
    }
  }
);

/**
 * PUT /v1/auth/me/registered-services
 * Update the user's per-service active flags.
 * Also toggles the `active` field on linked Designer/Producer profiles.
 */
router.put(
  "/me/registered-services",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { designer, producer, materials, author, gizmo } = req.body;

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({
        where: { id: userId },
        relations: ["designerProfile", "producerProfile"],
      });
      if (!user) return res.status(404).json({ error: "User not found" });

      // Update user-level flags
      if (designer !== undefined) user.activeDesigner = !!designer;
      if (producer !== undefined) user.activeProducer = !!producer;
      if (materials !== undefined) user.activeMaterials = !!materials;
      if (author !== undefined) user.activeAuthor = !!author;
      if (gizmo !== undefined) user.activeGizmo = !!gizmo;

      await userRepo.save(user);

      // Sync Designer profile active flag
      if (designer !== undefined && user.designerProfile) {
        const designerRepo = AppDataSource.getRepository(
          (await import("../entities/designer.js")).Designer
        );
        user.designerProfile.active = !!designer;
        await designerRepo.save(user.designerProfile);
      }

      // Sync Producer profile active flag
      if (producer !== undefined && user.producerProfile) {
        const producerRepo = AppDataSource.getRepository(
          (await import("../entities/producer.js")).Producer
        );
        user.producerProfile.active = !!producer;
        await producerRepo.save(user.producerProfile);
      }

      // Check for incomplete profile data and send email notification
      try {
        const missingByService: { service: string; missing: string[] }[] = [];

        // Check business identity (shared across all services)
        const hasBizLocation = user.businessLatitude && user.businessLongitude && user.businessLatitude !== 0 && user.businessLongitude !== 0;
        const hasBizName = !!user.businessName;
        const hasBizZip = !!user.businessZip;

        if (user.activeDesigner) {
          const missing: string[] = [];
          if (!hasBizName) missing.push("Business Display Name (Account Settings → Business Identity)");
          if (!hasBizZip) missing.push("Business ZIP Code (needed for map placement)");
          if (!hasBizLocation) missing.push("Business location coordinates (enter your ZIP code in Business Identity to auto-generate)");
          if (user.designerProfile) {
            if (!user.designerProfile.businessName) missing.push("Designer business name");
          } else {
            missing.push("Designer profile not yet created (visit Account Settings → Designer Services)");
          }
          if (missing.length > 0) missingByService.push({ service: "Designer", missing });
        }

        if (user.activeProducer) {
          const missing: string[] = [];
          if (!hasBizName) missing.push("Business Display Name (Account Settings → Business Identity)");
          if (!hasBizZip) missing.push("Business ZIP Code (needed for map placement)");
          if (!hasBizLocation) missing.push("Business location coordinates (enter your ZIP code in Business Identity to auto-generate)");
          if (user.producerProfile) {
            if (!user.producerProfile.capabilities_materialTypes || user.producerProfile.capabilities_materialTypes.length === 0)
              missing.push("Producer capabilities / material types");
          } else {
            missing.push("Producer profile not yet created (visit Account Settings → Producer Services)");
          }
          if (missing.length > 0) missingByService.push({ service: "Producer", missing });
        }

        // Send email for each incomplete service listing
        for (const { service, missing } of missingByService) {
          await emailService.sendIncompleteListingNotice(user.email, service, missing);
        }
      } catch (emailErr: any) {
        console.warn("Incomplete listing email failed (non-fatal):", emailErr.message);
      }

      res.json({
        success: true,
        message: "Registered services updated",
        services: {
          designer: user.activeDesigner,
          producer: user.activeProducer,
          materials: user.activeMaterials,
          author: user.activeAuthor,
          gizmo: user.activeGizmo,
        },
      });
    } catch (error) {
      console.error("Update registered services error:", error);
      res.status(500).json({ error: "Failed to update registered services" });
    }
  }
);

export default router;
