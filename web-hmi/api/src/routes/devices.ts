import express, { Request, Response } from "express";
import crypto from "crypto";
import { LessThan } from "typeorm";
import QRCode from "qrcode";
import { getHandler, listDevices } from "../devices/index.js";
import { cropTemplates } from "../devices/aero-ctrl/config-schema.js";
import { verifyToken, verifyTokenOrDeviceToken, verifyDeviceToken } from "../middleware/auth.js";
import { JWT_SECRET } from "../config/jwt.js";
import AppDataSource from "../database.js";
import { Device } from "../entities/device.js";
import { DeviceConfig } from "../entities/device-config.js";
import { TelemetryLog } from "../entities/telemetry-log.js";
import { User, UserRole } from "../entities/user.js";
import { decodeSettings, encodeSettings, unframePipeline, framePipeline } from "../pipeline/pipeline-codec.js";
import { BLOCK_REGISTRY } from "../pipeline/block-registry.js";

const router = express.Router();

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

/** Generate an 8-char alphanumeric claim code formatted as XXXX-XXXX */
function generateClaimCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  let code = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** PREFIX registry — maps deviceType slug to serial number prefix. Mirrors AI-INSTRUCT.md § PREFIX Registry. */
const SERIAL_PREFIX: Record<string, string> = {
  "aero-ctrl":      "PDAC",
  "h20-chiller":    "PDCH",
  "portioning-feeder": "PDPF",
};

/**
 * Generate a serial number following the convention: {PREFIX}-{NNNNN}
 * PREFIX comes from SERIAL_PREFIX; sequence is 5-digit zero-padded, starting at 00001.
 * Dev rigs are provisioned manually with {PREFIX}-DEV-{NNNNN} — this function generates
 * production serials only.
 */
async function generateSerial(deviceType: string): Promise<string> {
  const prefix = SERIAL_PREFIX[deviceType] ?? deviceType.slice(0, 4).toUpperCase();
  const serialPrefix = `${prefix}-`;

  const deviceRepo = AppDataSource.getRepository(Device);
  // Exclude dev-rig serials from the sequence count
  const latest = await deviceRepo
    .createQueryBuilder("d")
    .where("d.serialNumber LIKE :prefix", { prefix: `${serialPrefix}%` })
    .andWhere("d.serialNumber NOT LIKE :devPrefix", { devPrefix: `${serialPrefix}DEV-%` })
    .orderBy("d.serialNumber", "DESC")
    .getOne();

  let seq = 1;
  if (latest) {
    const parts = latest.serialNumber.split("-");
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${serialPrefix}${String(seq).padStart(5, "0")}`;
}

/** Admin auth middleware (duplicated pattern from admin.ts for route isolation) */
async function requireAdmin(req: Request, res: Response, next: Function) {
  const userId = (req as any).userId;
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: userId } });
  if (!user || (user.role !== UserRole.ADMIN && !user.isStaff)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  (req as any).admin = user;
  next();
}

/** Max wrong claim attempts before per-serial lockout */
const MAX_CLAIM_ATTEMPTS = 3;
/** Lockout duration in milliseconds (1 hour) */
const CLAIM_LOCKOUT_MS = 60 * 60 * 1000;

/** Max config snapshots kept per device — oldest deleted beyond this */
const MAX_CONFIG_SNAPSHOTS = 50;

/** Max telemetry rows kept per device — depends on cloud subscription */
const MAX_TELEMETRY_ROWS_FREE  =  500;
const MAX_TELEMETRY_ROWS_CLOUD = 5000;

// ──────────────────────────────────────────
// Public / schema routes (no auth required)
// ──────────────────────────────────────────

/**
 * GET /v1/devices/types — List all registered device types
 */
router.get("/types", (req: Request, res: Response) => {
  res.json(listDevices());
});

/**
 * GET /v1/devices/types/:type/schema — Get config schema for a device type
 * Query: ?firmware=1.0.0 (optional, defaults to latest)
 */
router.get("/types/:type/schema", (req: Request, res: Response) => {
  const handler = getHandler(req.params.type);
  if (!handler) {
    return res.status(404).json({ error: `Unknown device type: ${req.params.type}` });
  }

  const firmware = (req.query.firmware as string) || handler.listFirmwareVersions()[0]?.version || "1.0.0";
  const schema = handler.getConfigSchema(firmware);

  res.json({ deviceType: handler.type, displayName: handler.displayName, firmware, schema });
});

/**
 * GET /v1/devices/types/:type/firmware — List firmware versions for a device type
 */
router.get("/types/:type/firmware", (req: Request, res: Response) => {
  const handler = getHandler(req.params.type);
  if (!handler) {
    return res.status(404).json({ error: `Unknown device type: ${req.params.type}` });
  }

  res.json({ deviceType: handler.type, versions: handler.listFirmwareVersions() });
});

/**
 * POST /v1/devices/types/:type/validate — Validate a config payload
 */
router.post("/types/:type/validate", (req: Request, res: Response) => {
  const handler = getHandler(req.params.type);
  if (!handler) {
    return res.status(404).json({ error: `Unknown device type: ${req.params.type}` });
  }

  const firmware = (req.query.firmware as string) || handler.listFirmwareVersions()[0]?.version || "1.0.0";
  const result = handler.validateConfig(req.body, firmware);

  res.json(result);
});

/**
 * GET /v1/devices/types/:type/templates — Get crop templates (aeroponic-controller specific for now)
 */
router.get("/types/:type/templates", (req: Request, res: Response) => {
  if (req.params.type === "aero-ctrl") {
    res.json(cropTemplates);
  } else {
    res.json({});
  }
});

/**
 * GET /v1/devices/lookup/:serial — Look up a device by serial number (public)
 * Returns device type, whether it's claimed, and the device ID if the caller owns it.
 * Does NOT leak owner info for devices belonging to other users.
 */
router.get("/lookup/:serial", async (req: Request, res: Response) => {
  try {
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { serialNumber: req.params.serial } });

    if (!device) {
      return res.json({ found: false });
    }

    // Check if the caller owns this device (optional auth)
    let isOwner = false;
    const token = req.headers.authorization?.split(" ")[1] || (req as any).cookies?.pds_token;
    if (token) {
      try {
        const jwt = await import("jsonwebtoken");
        const decoded = jwt.default.verify(token, JWT_SECRET) as { userId: string };
        isOwner = decoded.userId === device.ownerId;
      } catch { /* invalid token — not owner */ }
    }

    res.json({
      found: true,
      claimed: !!device.ownerId,
      isOwner,
      deviceId: isOwner ? device.id : undefined,
      deviceType: device.deviceType,
    });
  } catch (err: any) {
    console.error("GET /devices/lookup error:", err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

/**
 * GET /v1/devices/qr/:type/:serial — Generate QR code as SVG
 * Returns an SVG string that encodes the device claim URL (includes claim code if unclaimed)
 */
router.get("/qr/:type/:serial", async (req: Request, res: Response) => {
  const { type, serial } = req.params;
  const handler = getHandler(type);
  if (!handler) {
    return res.status(404).json({ error: `Unknown device type: ${type}` });
  }

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

  // Look up the device to include claim code if it exists and is unclaimed
  const deviceRepo = AppDataSource.getRepository(Device);
  const device = await deviceRepo.createQueryBuilder("device")
    .addSelect("device.claimCode")
    .where("device.serialNumber = :serial", { serial })
    .getOne();

  let deviceUrl: string;
  if (device?.claimCode && !device.ownerId) {
    deviceUrl = `${baseUrl}/device/claim/${encodeURIComponent(serial)}?code=${encodeURIComponent(device.claimCode)}`;
  } else {
    deviceUrl = `${baseUrl}/device/${encodeURIComponent(type)}/${encodeURIComponent(serial)}`;
  }

  try {
    const svg = await QRCode.toString(deviceUrl, { type: "svg", margin: 2, width: 256 });
    res.type("image/svg+xml").send(svg);
  } catch (err: any) {
    console.error("QR generation error:", err);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

// ──────────────────────────────────────────
// Authenticated device instance routes
// ──────────────────────────────────────────

/**
 * GET /v1/devices/mine — List all devices owned by the logged-in user
 */
router.get("/mine", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const devices = await deviceRepo.find({
      where: { ownerId: userId },
      order: { createdAt: "DESC" },
    });

    // Enrich with display names from the handler registry
    const result = devices.map(d => {
      const handler = getHandler(d.deviceType);
      return {
        id: d.id,
        deviceType: d.deviceType,
        displayName: d.displayName || handler?.displayName || d.deviceType,
        serialNumber: d.serialNumber,
        friendlyName: d.friendlyName,
        firmwareVersion: d.firmwareVersion,
        board: d.board,
        hwrev: d.hwrev,
        active: d.active,
        lastSeenAt: d.lastSeenAt,
        hasPendingConfig: d.pendingConfig != null,
        createdAt: d.createdAt,
      };
    });

    res.json(result);
  } catch (err: any) {
    console.error("GET /devices/mine error:", err);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

/**
 * POST /v1/devices/register — Claim a provisioned device using serial + claim code
 * Body: { serialNumber: string, claimCode: string, friendlyName?: string }
 */
router.post("/register", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { serialNumber, claimCode, friendlyName } = req.body;

    if (!serialNumber || !claimCode) {
      return res.status(400).json({ error: "serialNumber and claimCode are required" });
    }

    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.createQueryBuilder("device")
      .addSelect("device.claimCode")
      .addSelect("device.deviceToken")
      .where("device.serialNumber = :serialNumber", { serialNumber })
      .getOne();

    if (!device) {
      return res.status(404).json({ error: "Device not found. Please check the serial number." });
    }

    // Already owned?
    if (device.ownerId) {
      if (device.ownerId === userId) {
        return res.status(409).json({ error: "You already own this device", deviceId: device.id });
      }
      return res.status(409).json({ error: "This device is already registered to another account" });
    }

    // Per-serial lockout check
    if (device.claimLockedUntil && device.claimLockedUntil > new Date()) {
      const minutesLeft = Math.ceil((device.claimLockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${minutesLeft} minute(s).`,
      });
    }

    // Verify claim code (case-insensitive, strip whitespace)
    const normalizedInput = claimCode.replace(/[\s-]/g, "").toUpperCase();
    const normalizedStored = (device.claimCode || "").replace(/[\s-]/g, "").toUpperCase();

    if (!normalizedStored || normalizedInput !== normalizedStored) {
      // Wrong code — increment attempts, possibly lock
      device.claimAttempts = (device.claimAttempts || 0) + 1;
      if (device.claimAttempts >= MAX_CLAIM_ATTEMPTS) {
        device.claimLockedUntil = new Date(Date.now() + CLAIM_LOCKOUT_MS);
        device.claimAttempts = 0; // reset counter for next lockout cycle
        await deviceRepo.save(device);
        return res.status(429).json({
          error: "Too many failed attempts. This device is locked for 1 hour.",
        });
      }
      await deviceRepo.save(device);
      return res.status(403).json({
        error: "Invalid claim code",
        attemptsRemaining: MAX_CLAIM_ATTEMPTS - device.claimAttempts,
      });
    }

    // Success — claim the device
    device.ownerId = userId;
    device.claimedAt = new Date();
    device.claimCode = null as any;  // burn the one-time code
    device.claimAttempts = 0;
    device.claimLockedUntil = null as any;
    if (friendlyName) device.friendlyName = friendlyName;

    // Generate device token for firmware authentication (if not already set)
    if (!device.deviceToken) {
      device.deviceToken = crypto.randomBytes(32).toString("hex");
    }
    await deviceRepo.save(device);

    const handler = getHandler(device.deviceType);
    const apiBase = process.env.BASE_URL ? `${process.env.BASE_URL}/v1` : `${req.protocol}://${req.get("host")}/v1`;
    res.status(200).json({
      id: device.id,
      serialNumber: device.serialNumber,
      deviceType: device.deviceType,
      displayName: device.displayName || handler?.displayName || device.deviceType,
      friendlyName: device.friendlyName,
      // All three NVS credentials the phone app needs to provision the device.
      // deviceToken is returned ONCE — not stored in plain text elsewhere.
      deviceToken: device.deviceToken,
      apiUrl: apiBase,
    });
  } catch (err: any) {
    console.error("POST /devices/register error:", err);
    res.status(500).json({ error: "Failed to register device" });
  }
});

// ──────────────────────────────────────────
// Admin / Manufacturing  (requires admin role)
// Must be defined BEFORE /:id routes to avoid "admin" matching as :id param
// ──────────────────────────────────────────

/**
 * POST /v1/devices/admin/provision — Provision a single device
 * Body: { deviceType: string, board?: string, hwrev?: string, role?: string, serialNumber?: string, displayName?: string }
 * displayName: admin label for this specific unit (e.g. "Chiller 60W"). Stored on the device row.
 * Returns the new device record + claim code + QR SVG
 */
router.post("/admin/provision", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { deviceType, board, hwrev, role, serialNumber, displayName } = req.body;

    if (!deviceType) {
      return res.status(400).json({ error: "deviceType is required" });
    }
    const handler = getHandler(deviceType);
    if (!handler) {
      return res.status(400).json({ error: `Unknown device type: ${deviceType}` });
    }

    const serial = serialNumber || await generateSerial(deviceType);
    const claimCode = generateClaimCode();

    const deviceRepo = AppDataSource.getRepository(Device);

    // Check for duplicate serial
    const existing = await deviceRepo.findOne({ where: { serialNumber: serial } });
    if (existing) {
      return res.status(409).json({ error: `Serial number ${serial} already exists` });
    }

    const device = deviceRepo.create({
      deviceType,
      board: board || null,
      hwrev: hwrev || null,
      role: role || null,
      serialNumber: serial,
      displayName: displayName || null,
      claimCode,
    });
    await deviceRepo.save(device);

    // Generate QR with claim URL
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const claimUrl = `${baseUrl}/device/claim/${encodeURIComponent(serial)}?code=${encodeURIComponent(claimCode)}`;
    const qrSvg = await QRCode.toString(claimUrl, { type: "svg", margin: 2, width: 256 });

    res.status(201).json({
      id: device.id,
      serialNumber: serial,
      deviceType,
      displayName: device.displayName || handler.displayName,
      claimCode,
      claimUrl,
      qrSvg,
    });
  } catch (err: any) {
    console.error("POST /devices/admin/provision error:", err);
    res.status(500).json({ error: "Failed to provision device" });
  }
});

/**
 * POST /v1/devices/admin/provision-batch — Provision multiple devices at once
 * Body: { deviceType: string, count: number }
 * Returns array of provisioned devices with serial + claimCode
 */
router.post("/admin/provision-batch", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { deviceType, count } = req.body;

    if (!deviceType) {
      return res.status(400).json({ error: "deviceType is required" });
    }
    const handler = getHandler(deviceType);
    if (!handler) {
      return res.status(400).json({ error: `Unknown device type: ${deviceType}` });
    }

    const batchSize = Math.min(Math.max(parseInt(count) || 1, 1), 100); // cap at 100
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const deviceRepo = AppDataSource.getRepository(Device);

    const results: Array<{
      id: string;
      serialNumber: string;
      claimCode: string;
      claimUrl: string;
    }> = [];

    for (let i = 0; i < batchSize; i++) {
      const serial = await generateSerial(deviceType);
      const claimCode = generateClaimCode();

      const device = deviceRepo.create({
        deviceType,
        serialNumber: serial,
        claimCode,
      });
      await deviceRepo.save(device);

      const claimUrl = `${baseUrl}/device/claim/${encodeURIComponent(serial)}?code=${encodeURIComponent(claimCode)}`;
      results.push({
        id: device.id,
        serialNumber: serial,
        claimCode,
        claimUrl,
      });
    }

    res.status(201).json({
      deviceType,
      displayName: handler.displayName,
      count: results.length,
      devices: results,
    });
  } catch (err: any) {
    console.error("POST /devices/admin/provision-batch error:", err);
    res.status(500).json({ error: "Failed to provision batch" });
  }
});

/**
 * GET /v1/devices/admin/all — List all provisioned devices (admin view)
 * Query: ?type=aero-ctrl&claimed=true&limit=50&offset=0
 */
router.get("/admin/all", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deviceRepo = AppDataSource.getRepository(Device);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const qb = deviceRepo.createQueryBuilder("d");

    if (req.query.type) {
      qb.andWhere("d.deviceType = :type", { type: req.query.type });
    }
    if (req.query.claimed === "true") {
      qb.andWhere("d.ownerId IS NOT NULL");
    } else if (req.query.claimed === "false") {
      qb.andWhere("d.ownerId IS NULL");
    }

    const [devices, total] = await qb
      .orderBy("d.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    res.json({
      total,
      limit,
      offset,
      devices: devices.map(d => ({
        id: d.id,
        deviceType: d.deviceType,
        displayName: d.displayName || null,
        serialNumber: d.serialNumber,
        ownerId: d.ownerId,
        claimedAt: d.claimedAt,
        friendlyName: d.friendlyName,
        active: d.active,
        createdAt: d.createdAt,
      })),
    });
  } catch (err: any) {
    console.error("GET /devices/admin/all error:", err);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

// ──────────────────────────────────────────
// Device instance routes (parameterized :id)
// ──────────────────────────────────────────

/**
 * PATCH /v1/devices/admin/:id/hardware — Set board/hwrev/role/firmwareVersion on an existing device.
 * Body: { board?: string, hwrev?: string, role?: string, firmwareVersion?: string }
 * Used to backfill hardware identity on devices provisioned before the versioning schema change,
 * and by the /ota-test flow to set these fields before triggering a cloud OTA.
 */
router.patch("/admin/:id/hardware", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    const { board, hwrev, role, firmwareVersion, displayName } = req.body;
    if (!board && !hwrev && !role && !firmwareVersion && displayName === undefined) {
      return res.status(400).json({ error: "Provide at least one of: board, hwrev, role, firmwareVersion, displayName" });
    }

    if (board           !== undefined) device.board           = board;
    if (hwrev           !== undefined) device.hwrev           = hwrev;
    if (role            !== undefined) device.role            = role;
    if (firmwareVersion !== undefined) device.firmwareVersion = firmwareVersion;
    if (displayName     !== undefined) device.displayName     = displayName;
    await deviceRepo.save(device);

    res.json({ id: device.id, board: device.board, hwrev: device.hwrev, role: device.role, firmwareVersion: device.firmwareVersion, displayName: device.displayName });
  } catch (err: any) {
    console.error("PATCH /devices/admin/:id/hardware error:", err);
    res.status(500).json({ error: "Failed to update hardware identity" });
  }
});

/**
 * GET /v1/devices/admin/devrig/:deviceId — Return NVS devrig fields for a provisioned device.
 * Admin-only. Intended for the gen_nvs_devrig.py build tool.
 * Pass ?reset=true to rotate the device token (generates + saves a new one).
 */
router.get("/admin/devrig/:deviceId", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deviceRepo = AppDataSource.getRepository(Device);
    // Must explicitly select deviceToken (select: false on column)
    const device = await deviceRepo
      .createQueryBuilder("d")
      .addSelect("d.deviceToken")
      .where("d.id = :id", { id: req.params.deviceId })
      .getOne();

    if (!device) return res.status(404).json({ error: "Device not found" });

    if (req.query.reset === "true" || !device.deviceToken) {
      device.deviceToken = crypto.randomBytes(32).toString("hex");
      await deviceRepo.save(device);
    }

    res.json({
      deviceId: device.id,
      deviceToken: device.deviceToken,
      board: device.board,
      hwrev: device.hwrev,
      role: device.role,
    });
  } catch (err: any) {
    console.error("GET /devices/admin/devrig/:deviceId error:", err);
    res.status(500).json({ error: "Failed to fetch devrig credentials" });
  }
});

/**
 * GET /v1/devices/:id — Get a single device (must be owner)
 */
router.get("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });

    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    const handler = getHandler(device.deviceType);
    const meta = device.pipelineMeta as any;
    res.json({
      id: device.id,
      deviceType: device.deviceType,
      displayName: device.displayName || handler?.displayName || device.deviceType,
      serialNumber: device.serialNumber,
      friendlyName: device.friendlyName,
      firmwareVersion: device.firmwareVersion,
      board: device.board,
      hwrev: device.hwrev,
      currentConfig: device.currentConfig,
      pendingConfig: device.pendingConfig,
      active: device.active,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
      pendingPipelineAt: device.pendingPipelineAt ?? null,
      settingsSavedAt: device.settingsSavedAt ?? null,
      settingsConfirmedAt: device.settingsConfirmedAt ?? null,
      pipelineRole: meta?.role ?? null,
      pipelinePushedAt: meta?.pushedAt ?? null,
      pipelineNames: Array.isArray(meta?.pipelines)
        ? meta.pipelines.filter((p: any) => !p.internal).map((p: any) => p.name)
        : null,
    });
  } catch (err: any) {
    console.error("GET /devices/:id error:", err);
    res.status(500).json({ error: "Failed to fetch device" });
  }
});

/**
 * PATCH /v1/devices/:id — Update device settings.
 * Body: { friendlyName?: string, autoUpdateEnabled?: boolean }
 */
router.patch("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });

    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    if (req.body.friendlyName !== undefined) {
      device.friendlyName = req.body.friendlyName;
    }
    if (req.body.autoUpdateEnabled !== undefined) {
      device.autoUpdateEnabled = Boolean(req.body.autoUpdateEnabled);
    }

    await deviceRepo.save(device);
    res.json({ id: device.id, friendlyName: device.friendlyName, autoUpdateEnabled: device.autoUpdateEnabled });
  } catch (err: any) {
    console.error("PATCH /devices/:id error:", err);
    res.status(500).json({ error: "Failed to update device" });
  }
});

/**
 * POST /v1/devices/:id/config — Save config (creates pending + snapshot, caps at 50)
 * Body: { config payload }
 */
router.post("/:id/config", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const configRepo = AppDataSource.getRepository(DeviceConfig);

    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    // Validate against the device type's schema
    const handler = getHandler(device.deviceType);
    if (handler) {
      const validation = handler.validateConfig(req.body, device.firmwareVersion);
      if (!validation.valid) {
        return res.status(400).json({ error: "Invalid config", details: validation.errors });
      }
    }

    // Save as pending config on the device
    device.pendingConfig = req.body;
    await deviceRepo.save(device);

    // Create immutable config snapshot
    const snapshot = configRepo.create({
      deviceId: device.id,
      firmwareVersion: device.firmwareVersion,
      config: req.body,
      submittedBy: userId,
    });
    await configRepo.save(snapshot);

    // Enforce cap: delete oldest snapshots beyond MAX_CONFIG_SNAPSHOTS
    const count = await configRepo.count({ where: { deviceId: device.id } });
    if (count > MAX_CONFIG_SNAPSHOTS) {
      const excess = await configRepo.find({
        where: { deviceId: device.id },
        order: { createdAt: "ASC" },
        take: count - MAX_CONFIG_SNAPSHOTS,
      });
      if (excess.length > 0) {
        await configRepo.remove(excess);
      }
    }

    res.json({
      saved: true,
      snapshotId: snapshot.id,
      pendingConfig: device.pendingConfig,
    });
  } catch (err: any) {
    console.error("POST /devices/:id/config error:", err);
    res.status(500).json({ error: "Failed to save config" });
  }
});

/**
 * POST /v1/devices/:id/acknowledge — Mark pending config as applied (device ACK'd)
 * Called after successful BLE write to the device
 */
router.post("/:id/acknowledge", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const configRepo = AppDataSource.getRepository(DeviceConfig);

    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    if (!device.pendingConfig) {
      return res.status(400).json({ error: "No pending config to acknowledge" });
    }

    // Promote pending → current
    device.currentConfig = device.pendingConfig;
    device.pendingConfig = null as any;
    device.lastSeenAt = new Date();
    await deviceRepo.save(device);

    // Mark latest snapshot as acknowledged
    const latestSnapshot = await configRepo.findOne({
      where: { deviceId: device.id },
      order: { createdAt: "DESC" },
    });
    if (latestSnapshot) {
      latestSnapshot.acknowledged = true;
      await configRepo.save(latestSnapshot);
    }

    res.json({ acknowledged: true, currentConfig: device.currentConfig });
  } catch (err: any) {
    console.error("POST /devices/:id/acknowledge error:", err);
    res.status(500).json({ error: "Failed to acknowledge config" });
  }
});

/**
 * GET /v1/devices/:id/config-history — Get config snapshot history
 * Query: ?limit=20&offset=0
 */
router.get("/:id/config-history", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);

    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    const configRepo = AppDataSource.getRepository(DeviceConfig);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const [snapshots, total] = await configRepo.findAndCount({
      where: { deviceId: device.id },
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    res.json({ total, limit, offset, snapshots });
  } catch (err: any) {
    console.error("GET /devices/:id/config-history error:", err);
    res.status(500).json({ error: "Failed to fetch config history" });
  }
});

/**
 * POST /v1/devices/:id/release — Release device ownership (owner unclaims)
 * Generates a new claim code so new owner can re-claim.
 */
router.post("/:id/release", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });

    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    device.ownerId = null as any;
    device.claimedAt = null as any;
    device.claimCode = generateClaimCode();
    device.claimAttempts = 0;
    device.claimLockedUntil = null as any;
    device.friendlyName = null as any;
    device.pendingConfig = null as any;
    await deviceRepo.save(device);

    res.json({ released: true, serialNumber: device.serialNumber });
  } catch (err: any) {
    console.error("POST /devices/:id/release error:", err);
    res.status(500).json({ error: "Failed to release device" });
  }
});

/**
 * Apply pipelineMeta alias/label overlays to a raw telemetry snapshot.
 * Called at ingest time so stored rows already carry human-readable labels.
 * Mirrors the overlay logic in GET /:id/live-state.
 */
function applySnapshotAliases(snap: any, pipelineMeta: any): any {
  const meta        = pipelineMeta ?? {};
  const pinLabels:    Record<string, any> = meta.pinLabels    ?? {};
  const sensorRefMap: Record<string, any> = meta.sensorRefMap ?? {};
  const timerRefMap:  Record<string, any> = meta.timerRefMap  ?? {};
  const outputRefMap: Record<string, any> = meta.outputRefMap ?? {};

  const overlayLabel = (arr: any[], pinKey: string) =>
    (arr ?? []).map(item => {
      // Prefer alias from sensorRefMap (set by overlayRef) — it's the block's user alias and
      // takes precedence over pinLabels, which can collide when the same GPIO is assigned to
      // multiple roles (e.g. FillMotorAmps ADC and PH power GPIO both on GPIO 32).
      if (item.alias) return { ...item, label: item.alias };
      const lbl = pinLabels[String(item[pinKey])];
      return lbl ? { ...item, label: lbl } : item;
    });

  const overlayRef = (arr: any[], kindPrefix: string) =>
    (arr ?? []).map(item => {
      const entry = sensorRefMap[`${kindPrefix}:${item.pin}`];
      if (!entry) return item;
      return { ...item, sensorRef: entry.sensorRef, alias: entry.alias,
               pipelineName: entry.pipelineName ?? null, blockIndex: entry.blockIndex ?? null };
    });

  const overlayOutputRef = (arr: any[], kindPrefix: string) =>
    (arr ?? []).map(item => {
      const entry = outputRefMap[`${kindPrefix}:${item.pin}`];
      if (!entry) return item;
      return { ...item, pipelineName: entry.pipelineName ?? null, blockIndex: entry.blockIndex ?? null,
               countRateAtFull: kindPrefix === 'pwm' ? (entry.countRateAtFull ?? null) : undefined };
    });

  const overlayTimerRef = (arr: any[]) =>
    (arr ?? []).map((item, idx) => {
      const entry = timerRefMap[`timer:${item.timerId ?? idx}`];
      if (!entry) return item;
      return { ...item, label: entry.label, alias: entry.label,
               blockType: entry.blockType ?? null, onMs: entry.onMs ?? null,
               offMs: entry.offMs ?? null, durationMs: entry.durationMs ?? null,
               pipelineName: entry.pipelineName ?? null, blockIndex: entry.blockIndex ?? null };
    });

  const overlayPeriphRef = (arr: any[]) =>
    (arr ?? []).map(item => {
      const entry = sensorRefMap[`periph:${item.pin}:${item.field}`];
      if (!entry) return item;
      return { ...item, alias: entry.alias,
               pipelineName: entry.pipelineName ?? null, blockIndex: entry.blockIndex ?? null };
    });

  return {
    ...snap,
    adcReadings:        overlayLabel(overlayRef(snap.adcReadings        ?? [], 'adc'),  'pin'),
    pwmOutputs:         overlayOutputRef(overlayLabel(snap.pwmOutputs   ?? [], 'pin'), 'pwm'),
    gpioStates:         overlayOutputRef(overlayLabel(overlayRef(snap.gpioStates ?? [], 'gpio'), 'pin'), 'gpio'),
    timerStates:        overlayTimerRef(snap.timerStates                ?? []),
    peripheralReadings: overlayPeriphRef(snap.peripheralReadings        ?? []),
  };
}

/**
 * POST /v1/devices/:id/telemetry — Archive a telemetry snapshot
 * Called by the browser each poll cycle so history is persisted server-side.
 * Body: { deviceTimestampUnix, deviceUptimeMs, packetId, statusFlags, snapshot }
 * The oldest rows are pruned automatically when the per-device cap is exceeded.
 */
router.post("/:id/telemetry", verifyTokenOrDeviceToken, async (req: Request, res: Response) => {
  try {
    const deviceRepo = AppDataSource.getRepository(Device);
    const telRepo = AppDataSource.getRepository(TelemetryLog);

    // Resolve device depending on auth type
    let device: Device | null = null;
    if ((req as any).authenticatedDevice) {
      // Device firmware path: token already verified, confirm ID matches URL
      const authDevice = (req as any).authenticatedDevice as Device;
      if (authDevice.id !== req.params.id) {
        return res.status(403).json({ error: "Token does not match device ID" });
      }
      device = authDevice;
    } else {
      // User JWT path (browser archiving)
      const userId = (req as any).userId;
      device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
    }

    const { deviceTimestampUnix, deviceUptimeMs, packetId, statusFlags, snapshot } = req.body;
    if (!snapshot) {
      return res.status(400).json({ error: "snapshot is required" });
    }

    // Sanitize device clock: anything before 2020-01-01 (Unix 1577836800) is
    // pre-NTP garbage (boot-relative seconds or 0). Fall back to server time.
    const MIN_VALID_UNIX = 1577836800;
    const resolvedUnix: number =
      typeof deviceTimestampUnix === 'number' && deviceTimestampUnix >= MIN_VALID_UNIX
        ? deviceTimestampUnix
        : Math.floor(Date.now() / 1000);

    // Update device heartbeat + write live state directly on the device record
    device.lastSeenAt = new Date();
    // Embed the resolved timestamp into the snapshot so live-state can surface it
    device.liveState = { ...(snapshot as object), deviceTimestampUnix: resolvedUnix };

    // Update firmwareVersion if the device reported it
    if (req.body.firmwareVersion && typeof req.body.firmwareVersion === 'string') {
      device.firmwareVersion = req.body.firmwareVersion;
    }

    // Backfill board/hwrev/role from NVS if the device reports them and the DB record is missing them.
    // Device firmware reads these from NVS (written by nvs_devrig.csv at flash time) and includes
    // them in every telemetry push. This auto-populates records provisioned before the versioning schema.
    // Values are validated against a strict format to prevent path injection in firmware lookup URLs.
    const VALID_HW_FIELD = /^[a-zA-Z0-9_\-.]{1,64}$/;
    const backfillBoard = !device.board && typeof req.body.board === 'string' && VALID_HW_FIELD.test(req.body.board);
    const backfillHwrev = !device.hwrev && typeof req.body.hwrev === 'string' && VALID_HW_FIELD.test(req.body.hwrev);
    const backfillRole  = !device.role  && typeof req.body.role  === 'string' && VALID_HW_FIELD.test(req.body.role);
    if (backfillBoard) device.board = req.body.board;
    if (backfillHwrev) device.hwrev = req.body.hwrev;
    if (backfillRole)  device.role  = req.body.role;

    // Use a targeted update instead of save() to avoid overwriting pendingOtaVersion/pendingOtaUrl
    // set by a concurrent POST /:id/ota call (race condition when device pushes telemetry every 1 s).
    await deviceRepo.update(device.id, {
      lastSeenAt:      device.lastSeenAt,
      liveState:       device.liveState   as any,
      firmwareVersion: device.firmwareVersion,
      ...(backfillBoard ? { board: device.board } : {}),
      ...(backfillHwrev    ? { hwrev:    device.hwrev    } : {}),
      ...(backfillRole     ? { role:     device.role     } : {}),
    });

    // Auto-update: if enabled and no OTA already pending, check FwServer for a newer version
    if (device.autoUpdateEnabled && !device.pendingOtaVersion && device.firmwareVersion) {
      try {
        const FW_SERVER_URL = (process.env.FW_SERVER_URL || "http://localhost:3002").replace(/\/$/, "");
        // Build query: match on board+hwrev+deviceType if available, fall back to deviceType only
        const fwQuery = device.board && device.hwrev
          ? `${FW_SERVER_URL}/v1/firmware/${device.board}/${device.hwrev}/${device.deviceType}?activeOnly=true`
          : `${FW_SERVER_URL}/v1/firmware?deviceType=${device.deviceType}&activeOnly=true`;
        const fwRes = await fetch(fwQuery);
        if (fwRes.ok) {
          const versions = await fwRes.json() as Array<{ version: string; active: boolean }>;
          const latest = versions[0]; // FwServer returns DESC by releasedAt
          if (latest && latest.version !== device.firmwareVersion) {
            const baseUrl = process.env.BASE_URL
              ? process.env.BASE_URL.replace(/\/$/, "")
              : `http://localhost:3001`;
            const fwSegment = device.board && device.hwrev
              ? `${device.board}/${device.hwrev}/${device.deviceType}/${latest.version}`
              : `${device.deviceType}/${latest.version}`;
            const downloadUrl = `${baseUrl}/v1/firmware/${fwSegment}/device-download`;
            device.pendingOtaVersion = latest.version;
            device.pendingOtaUrl = downloadUrl;
            await deviceRepo.update(device.id, {
              pendingOtaVersion: latest.version,
              pendingOtaUrl: downloadUrl,
            });
            console.log(`[auto-ota] Queued ${latest.version} for device ${device.id} (was ${device.firmwareVersion})`);
          }
        }
      } catch (e) {
        // Non-fatal — auto-update failure should not break telemetry archiving
        console.warn(`[auto-ota] Version check failed for device ${device.id}:`, e);
      }
    }

    // Persist snapshot — enrich with aliases so logs show human-readable labels
    const annotatedSnapshot = applySnapshotAliases(snapshot, device.pipelineMeta);
    const row = telRepo.create({
      deviceId: device.id,
      deviceTimestampUnix: resolvedUnix,
      deviceUptimeMs: deviceUptimeMs ?? 0,
      packetId: packetId ?? 0,
      statusFlags: statusFlags ?? 0,
      snapshot: annotatedSnapshot,
    });
    await telRepo.save(row);

    // Prune oldest rows beyond the per-device FIFO cap
    const telCap = device.cloudEnabled ? MAX_TELEMETRY_ROWS_CLOUD : MAX_TELEMETRY_ROWS_FREE;
    await telRepo
      .createQueryBuilder()
      .delete()
      .where(
        `"deviceId" = :id AND id NOT IN (
          SELECT id FROM telemetry_logs
          WHERE "deviceId" = :id
          ORDER BY "capturedAt" DESC
          LIMIT :cap
        )`,
        { id: device.id, cap: telCap },
      )
      .execute();

    res.json({ archived: true, id: row.id });
  } catch (err: any) {
    console.error("POST /devices/:id/telemetry error:", err);
    res.status(500).json({ error: "Failed to archive telemetry" });
  }
});

/**
 * GET /v1/devices/:id/telemetry — Retrieve archived telemetry history
 * Query: ?limit=100&offset=0&since=<ISO-date>
 */
router.get("/:id/telemetry", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);

    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    const telRepo = AppDataSource.getRepository(TelemetryLog);
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const qb = telRepo
      .createQueryBuilder("t")
      .where("t.deviceId = :id", { id: device.id })
      .orderBy("t.capturedAt", "DESC")
      .take(limit)
      .skip(offset);

    if (req.query.since) {
      qb.andWhere("t.capturedAt >= :since", { since: new Date(req.query.since as string) });
    }

    const [rows, total] = await qb.getManyAndCount();

    // Re-apply the current pipelineMeta overlay so that even rows stored before
    // the latest pipeline push (which may be missing onMs/offMs/blockType) get
    // enriched with up-to-date labels and timing info.
    const enriched = rows.map(row => ({
      ...row,
      snapshot: applySnapshotAliases(row.snapshot, device.pipelineMeta),
    }));

    res.json({ total, limit, offset, rows: enriched });
  } catch (err: any) {
    console.error("GET /devices/:id/telemetry error:", err);
    res.status(500).json({ error: "Failed to fetch telemetry" });
  }
});

/**
 * GET /v1/devices/:id/live-state — Latest telemetry snapshot, written on every device check-in.
 * Returns the snapshot struct directly (no paging, no table scan).
 * Shape: { capturedAt, adcReadings, pwmOutputs, gpioStates }
 */
router.get("/:id/live-state", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }
    // Overlay pin labels from role JSON (stored in pipelineMeta.pinLabels at pipeline push time).
    // Replaces firmware auto-labels like "PWM18" with user-defined names like "Fogger - Pump".
    const meta: any = (device.pipelineMeta as any) ?? {};
    const pinLabels:    Record<string, any> = meta.pinLabels    ?? {};
    const sensorRefMap: Record<string, any> = meta.sensorRefMap ?? {};
    const timerRefMap:  Record<string, any> = meta.timerRefMap  ?? {};
    const outputRefMap: Record<string, any> = meta.outputRefMap ?? {};

    // pipelineOrder: ordered list of non-internal pipeline names for the UI to render panels.
    // Pipelines with internal:true (kind:"sensor" input-only pipelines) are backend-only
    // and excluded — their sensor readings are reassigned to consumer pipelines in the meta push.
    const pipelineOrder: string[] = (meta.pipelines ?? [])
      .filter((p: any) => !p.internal)
      .map((p: any) => p.name as string);

    const overlayLabel = (arr: any[], pinKey: string) =>
      (arr ?? []).map(item => {
        // Prefer alias from sensorRefMap over pinLabels to avoid label collisions on shared pins.
        if (item.alias) return { ...item, label: item.alias };
        const lbl = pinLabels[String(item[pinKey])];
        return lbl ? { ...item, label: lbl } : item;
      });

    // Overlay sensorRef, alias, pipelineName, blockIndex from sensorRefMap.
    const overlayRef = (arr: any[], kindPrefix: string) =>
      (arr ?? []).map(item => {
        const entry = sensorRefMap[`${kindPrefix}:${item.pin}`];
        if (!entry) return item;
        return {
          ...item,
          sensorRef:    entry.sensorRef,
          alias:        entry.alias,
          pipelineName: entry.pipelineName ?? null,
          blockIndex:   entry.blockIndex   ?? null,
        };
      });

    // Overlay pipelineName + blockIndex (+ countRateAtFull for PWM) from outputRefMap.
    const overlayOutputRef = (arr: any[], kindPrefix: string) =>
      (arr ?? []).map(item => {
        const entry = outputRefMap[`${kindPrefix}:${item.pin}`];
        if (!entry) return item;
        return {
          ...item,
          pipelineName:    entry.pipelineName    ?? null,
          blockIndex:      entry.blockIndex      ?? null,
          ...(kindPrefix === 'pwm' ? { countRateAtFull: entry.countRateAtFull ?? null } : {}),
        };
      });

    // Overlay label, blockType, timing fields, pipelineName, blockIndex from timerRefMap.
    const overlayTimerRef = (arr: any[]) =>
      (arr ?? []).map((item, idx) => {
        const entry = timerRefMap[`timer:${item.timerId ?? idx}`];
        if (!entry) return item;
        return {
          ...item,
          label:        entry.label,
          alias:        entry.label,
          blockType:    entry.blockType    ?? null,
          onMs:         entry.onMs         ?? null,
          offMs:        entry.offMs        ?? null,
          durationMs:   entry.durationMs   ?? null,
          pipelineName: entry.pipelineName ?? null,
          blockIndex:   entry.blockIndex   ?? null,
        };
      });

    // Overlay alias, pipelineName, blockIndex from sensorRefMap onto peripheral readings.
    // Key format: periph:<pin>:<field>  — matches firmware's pin-based label "dht22:<pin>:<field>"
    const overlayPeriphRef = (arr: any[]) =>
      (arr ?? []).map(item => {
        const entry = sensorRefMap[`periph:${item.pin}:${item.field}`];
        if (!entry) return item;
        return {
          ...item,
          alias:        entry.alias,
          pipelineName: entry.pipelineName ?? null,
          blockIndex:   entry.blockIndex   ?? null,
        };
      });

    const ls = (device.liveState as any) ?? {};
    res.json({
      capturedAt:            device.lastSeenAt ?? null,
      deviceTimestampUnix:   ls.deviceTimestampUnix ?? null,
      pipelineOrder,
      ...ls,
      pwmOutputs:         overlayOutputRef(overlayLabel(ls.pwmOutputs ?? [],  "pin"), "pwm"),
      gpioStates:         overlayOutputRef(overlayLabel(overlayRef(ls.gpioStates  ?? [], "gpio"), "pin"), "gpio"),
      adcReadings:        overlayLabel(overlayRef(ls.adcReadings ?? [], "adc"), "pin"),
      timerStates:        overlayTimerRef(ls.timerStates ?? []),
      peripheralReadings: overlayPeriphRef(ls.peripheralReadings ?? []),
    });
  } catch (err: any) {
    console.error("GET /devices/:id/live-state error:", err);
    res.status(500).json({ error: "Failed to fetch live state" });
  }
});

/**
 * POST /v1/devices/:id/sync-request — Request the device to push its local logs to the cloud.
 *
 * The device polls GET /v1/devices/:id/pending-sync and, upon finding a pending request,
 * will batch-push any locally buffered log entries it hasn't yet uploaded.
 *
 * This endpoint is intentionally a "fire and forget" stub — the device acts on it
 * the next time it comes online and checks in.
 */
router.post("/:id/sync-request", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });

    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    // Mark that a sync is requested — the device will pick this up on its next check-in.
    await deviceRepo.update(device.id, { pendingSyncRequest: true });

    const isOnline = device.lastSeenAt
      ? Date.now() - new Date(device.lastSeenAt).getTime() < 5 * 60 * 1000
      : false;

    res.json({
      requested: true,
      deviceId: device.id,
      isOnline,
      message: isOnline
        ? "Sync requested. Device is online — logs will arrive shortly."
        : "Sync requested. Device will push logs when it next comes online.",
    });
  } catch (err: any) {
    console.error("POST /devices/:id/sync-request error:", err);
    res.status(500).json({ error: "Failed to queue sync request" });
  }
});

/**
 * GET /v1/devices/:id/pending-sync — Polled by the device firmware to check for a pending sync request.
 * Returns { pending: bool, otaUrl: string|null, otaVersion: string|null }
 * Clears the pendingSyncRequest flag once delivered.
 * OTA fields are NOT cleared here — cleared by the device after successful download.
 */
router.get("/:id/pending-sync", verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const authDevice = (req as any).authenticatedDevice as Device;
    if (authDevice.id !== req.params.id) {
      return res.status(403).json({ error: "Token does not match device ID" });
    }

    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id } });

    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    const pending = !!device.pendingSyncRequest;
    // Targeted update — does NOT overwrite pendingOtaVersion/pendingOtaUrl set by a concurrent POST /:id/ota
    await deviceRepo.update(device.id, {
      lastSeenAt: new Date(),
      ...(pending ? { pendingSyncRequest: false } : {}),
    });

    res.json({
      pending,
      otaUrl: device.pendingOtaUrl ?? null,
      otaVersion: device.pendingOtaVersion ?? null,
    });
  } catch (err: any) {
    console.error("GET /devices/:id/pending-sync error:", err);
    res.status(500).json({ error: "Failed to check sync status" });
  }
});

/**
 * POST /v1/devices/:id/refresh-token — Rotate the device firmware token (owner only).
 * Use this if a device token is compromised. Invalidates the old token immediately.
 * Returns the new token so the owner can re-flash NVS.
 */
router.post("/:id/refresh-token", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });

    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    device.deviceToken = crypto.randomBytes(32).toString("hex");
    await deviceRepo.save(device);

    res.json({
      deviceId: device.id,
      serialNumber: device.serialNumber,
      deviceToken: device.deviceToken,
    });
  } catch (err: any) {
    console.error("POST /devices/:id/refresh-token error:", err);
    res.status(500).json({ error: "Failed to rotate device token" });
  }
});

/**
 * GET /v1/devices/:id/pipeline — Return currentPipeline L1/L2/L3 as base64.
 *
 * Response: { l1: "<base64>", l2: "<base64>", l3: "<base64>", l1Bytes, l2Bytes, l3Bytes }
 * Returns 404 if no pipeline has been pushed yet.
 * Used by /pds-compare-settings to byte-diff role bins vs server-stored bins.
 */
router.get("/:id/pipeline", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }
    if (!device.currentPipeline) {
      return res.status(404).json({ error: "No pipeline has been pushed to this device yet" });
    }
    const framed = Buffer.from(device.currentPipeline, "base64");
    // unframe: [len:4LE][bytes] × 3
    let offset = 0;
    const readLayer = () => {
      const len = framed.readUInt32LE(offset); offset += 4;
      const layer = framed.subarray(offset, offset + len); offset += len;
      return layer;
    };
    const l1 = readLayer();
    const l2 = readLayer();
    const l3 = readLayer();
    res.json({
      l1: l1.toString("base64"),
      l2: l2.toString("base64"),
      l3: l3.toString("base64"),
      l1Bytes: l1.length,
      l2Bytes: l2.length,
      l3Bytes: l3.length,
    });
  } catch (err: any) {
    console.error("GET /devices/:id/pipeline error:", err);
    res.status(500).json({ error: "Failed to retrieve pipeline" });
  }
});

/**
 * POST /v1/devices/:id/pipeline — Queue a new L1/L2/L3 pipeline for the device.
 *
 * Body (JSON):
 *   { l1: "<base64>", l2: "<base64>", l3: "<base64>" }
 *
 * The framed binary is stored as pendingPipeline on the device record.
 * The device picks it up on its next poll of GET /v1/devices/:id/pending-pipeline.
 */
router.post("/:id/pipeline", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    const { l1, l2, l3, meta } = req.body;
    if (!l1 || !l2 || !l3) {
      return res.status(400).json({ error: "l1, l2, and l3 (base64) are required" });
    }

    // Reject oversized payloads before allocating buffers (~10 MB decoded ≈ 13.7 MB base64)
    const MAX_LAYER_B64_LEN = 14_000_000;
    if (l1.length > MAX_LAYER_B64_LEN || l2.length > MAX_LAYER_B64_LEN || l3.length > MAX_LAYER_B64_LEN) {
      return res.status(413).json({ error: "Pipeline layer exceeds 10 MB limit" });
    }

    let b1: Buffer, b2: Buffer, b3: Buffer;
    try {
      b1 = Buffer.from(l1, "base64");
      b2 = Buffer.from(l2, "base64");
      b3 = Buffer.from(l3, "base64");
    } catch {
      return res.status(400).json({ error: "Invalid base64 encoding" });
    }

    if (b1.length === 0 || b2.length === 0 || b3.length === 0) {
      return res.status(400).json({ error: "Pipeline layers must not be empty" });
    }

    // Preserve user settings: if the device already has a pipeline and the new
    // L1 topology is identical, reuse the stored L3 (user settings) rather than
    // overwriting with factory defaults.  If L1 changed, fall through to the
    // caller-supplied L3 (factory defaults) — topology change means old L3 is
    // positionally invalid anyway.
    let effectiveL3 = b3;
    if (device.currentPipeline) {
      try {
        const { l1: oldL1, l3: oldL3 } = unframePipeline(Buffer.from(device.currentPipeline, "base64"));
        if (oldL1.equals(b1) && oldL3.length > 0) {
          effectiveL3 = oldL3; // topology unchanged — keep user settings
        }
      } catch {
        // Corrupt stored pipeline — fall through to factory defaults
      }
    }

    /* Frame: [len:4LE][bytes] × 3 */
    const lenBuf = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n, 0); return b; };
    const framed = Buffer.concat([lenBuf(b1.length), b1, lenBuf(b2.length), b2, lenBuf(effectiveL3.length), effectiveL3]);

    device.pendingPipeline = framed.toString("base64");
    device.pendingPipelineAt = new Date();
    device.currentPipeline = framed.toString("base64");  // track what's running
    if (meta && typeof meta === 'object') {
      device.pipelineMeta = meta as Record<string, unknown>;
      // Update displayName from role's display_name — authoritative source is the role file.
      if (typeof (meta as any).displayName === 'string' && (meta as any).displayName) {
        device.displayName = (meta as any).displayName;
      }
    }
    await deviceRepo.save(device);

    res.json({
      queued: true,
      l1Bytes: b1.length,
      l2Bytes: b2.length,
      l3Bytes: effectiveL3.length,
      framedBytes: framed.length,
      settingsPreserved: effectiveL3 !== b3,
      message: effectiveL3 !== b3
        ? "Pipeline queued. User settings preserved (L1 topology unchanged)."
        : "Pipeline queued. Factory defaults applied (L1 topology changed or first push).",
    });
  } catch (err: any) {
    console.error("POST /devices/:id/pipeline error:", err);
    res.status(500).json({ error: "Failed to queue pipeline" });
  }
});

/**
 * GET /v1/devices/:id/pending-pipeline — Polled by device firmware.
 *
 * Returns:
 *   - 200 application/octet-stream — framed binary [L1_len][L1][L2_len][L2][L3_len][L3]
 *   - 204 No Content              — no pending pipeline
 *
 * Clears the pending pipeline and updates lastSeenAt after delivery.
 * Device must ACK via POST /v1/devices/:id/pipeline/ack after successful load.
 */
router.get("/:id/pending-pipeline", verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const authDevice = (req as any).authenticatedDevice as Device;
    if (authDevice.id !== req.params.id) {
      return res.status(403).json({ error: "Token does not match device ID" });
    }

    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    if (!device.pendingPipeline) {
      // Fast targeted update — avoid full entity save under write contention
      await deviceRepo.update(device.id, { lastSeenAt: new Date() });
      return res.status(204).send();
    }

    const framed = Buffer.from(device.pendingPipeline, "base64");

    // Send response first, then clear — avoids device timeout waiting on DB write
    res.set("Content-Type", "application/octet-stream");
    res.set("Content-Length", String(framed.length));
    res.send(framed);

    /* Clear once delivered — device must apply and ACK separately */
    await deviceRepo.update(device.id, {
      pendingPipeline: null as any,
      pendingPipelineAt: null as any,
      lastSeenAt: new Date(),
    });
  } catch (err: any) {
    console.error("GET /devices/:id/pending-pipeline error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /v1/devices/:id/pipeline/ack — Device ACKs successful pipeline load.
 * Updates firmwareVersion if provided in body.
 * Body (JSON): { status: "ok" | "error", error?: string, pipelineHash?: string }
 */
router.post("/:id/pipeline/ack", verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const authDevice = (req as any).authenticatedDevice as Device;
    if (authDevice.id !== req.params.id) {
      return res.status(403).json({ error: "Token does not match device ID" });
    }

    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id } });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    const { status, error: errMsg } = req.body || {};

    device.lastSeenAt = new Date();
    if (status === "ok") {
      device.settingsConfirmedAt = new Date();
    }
    await deviceRepo.save(device);

    if (status === "ok") {
      console.log(`[pipeline/ack] Device ${device.id} applied pipeline successfully`);
    } else {
      console.warn(`[pipeline/ack] Device ${device.id} pipeline load FAILED: ${errMsg}`);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error("POST /devices/:id/pipeline/ack error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Pipeline Settings — decode / re-encode L3 for the HMI settings panel
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /v1/devices/:id/pipeline-settings
 *
 * Decodes the device's currentPipeline (L1 + L3) into a structured JSON tree.
 * Response shape: { updateRateMs, pipelines: [ { index, blocks: [ { index, blockType, displayName, settings: { fieldName: { value, meta, fmtChar } } } ] } ] }
 */
router.get("/:id/pipeline-settings", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    if (!device.currentPipeline) {
      return res.status(404).json({ error: "No pipeline has been pushed to this device yet" });
    }

    const framed = Buffer.from(device.currentPipeline, "base64");
    const { l1, l3 } = unframePipeline(framed);
    const decoded = decodeSettings(l1, l3);

    // Overlay pipeline/block aliases from pipelineMeta (set when pipeline was pushed)
    const metaPipelines = (device.pipelineMeta as any)?.pipelines;
    if (Array.isArray(metaPipelines)) {
      decoded.pipelines.forEach((pl, pi) => {
        const metaPl = metaPipelines[pi];
        if (!metaPl) return;
        if (metaPl.name) pl.name = metaPl.name;
        if (Array.isArray(metaPl.blocks)) {
          // Build per-blockType queues so fb_ref gaps and other internal L1 blocks
          // don't shift the overlay index off — match decoded blocks by blockType in sequence
          const typeQueues: Record<string, any[]> = {};
          for (const mb of metaPl.blocks as any[]) {
            if (!mb.blockType) continue;
            if (!typeQueues[mb.blockType]) typeQueues[mb.blockType] = [];
            typeQueues[mb.blockType].push(mb);
          }
          const typeCursors: Record<string, number> = {};
          pl.blocks.forEach((blk: any) => {
            const bt = blk.blockType;
            if (!typeQueues[bt]) return;
            const cursor = typeCursors[bt] ?? 0;
            typeCursors[bt] = cursor + 1;
            const metaBlk = typeQueues[bt][cursor];
            if (!metaBlk) return;
            if (metaBlk.alias) blk.displayName = metaBlk.alias;
            // Overlay per-field metadata — spread to avoid mutating codec.ts copy
            if (metaBlk.fieldMeta && typeof metaBlk.fieldMeta === 'object') {
              for (const [fieldName, overrides] of Object.entries(metaBlk.fieldMeta as Record<string, any>)) {
                if (blk.settings[fieldName]) {
                  blk.settings[fieldName].meta = { ...blk.settings[fieldName].meta, ...overrides };
                }
              }
            }
          });
        }
      });
    }

    // Strip hw-level fields — pin assignments and design-time params are not
    // editable from the web HMI (L1 / 'hw' access level is for board designers only)
    decoded.pipelines.forEach(pl => {
      pl.blocks.forEach((blk: any) => {
        for (const key of Object.keys(blk.settings)) {
          if ((blk.settings[key] as any)?.meta?.level === 'hw') {
            delete blk.settings[key];
          }
        }
      });
    });

    res.json(decoded);
  } catch (err: any) {
    console.error("GET /devices/:id/pipeline-settings error:", err);
    res.status(500).json({ error: "Failed to decode pipeline settings" });
  }
});

/**
 * PATCH /v1/devices/:id/pipeline-meta — Update pipelineMeta only (no pipeline re-queue).
 *
 * Used by post_pipeline.ps1 (default mode) when pipeline binaries are unchanged but
 * label/ref maps (pinLabels, sensorRefMap, timerRefMap) need refreshing.
 * The device's current L3 (including any UI-edited settings) is preserved.
 *
 * Body: { meta: { pipelines?, pinLabels?, sensorRefMap?, timerRefMap?, ... } }
 */
router.patch("/:id/pipeline-meta", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    const { meta } = req.body || {};
    if (!meta || typeof meta !== 'object') {
      return res.status(400).json({ error: "Body must contain a meta object" });
    }

    device.pipelineMeta = meta as Record<string, unknown>;
    await deviceRepo.save(device);

    res.json({ updated: true });
  } catch (err: any) {
    console.error("PATCH /devices/:id/pipeline-meta error:", err);
    res.status(500).json({ error: "Failed to update pipeline meta" });
  }
});

/**
 * PATCH /v1/devices/:id/pipeline-settings
 *
 * Merges user-supplied field values into the current L3, re-encodes, and
 * queues the result as a new pending pipeline (L1 + L2 unchanged).
 *
 * Body: { pipelines: [ { index, blocks: [ { index, blockType, settings: { fieldName: { value } } } ] } ] }
 */
router.patch("/:id/pipeline-settings", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    if (!device.currentPipeline) {
      return res.status(404).json({ error: "No pipeline has been pushed to this device yet" });
    }

    const { pipelines } = req.body || {};
    if (!pipelines || !Array.isArray(pipelines)) {
      return res.status(400).json({ error: "Body must contain a pipelines array" });
    }

    const framed = Buffer.from(device.currentPipeline, "base64");
    const { l1, l2, l3 } = unframePipeline(framed);

    const newL3 = encodeSettings(l1, l3, pipelines);
    const newFramed = framePipeline(l1, l2, newL3);
    const newB64 = newFramed.toString("base64");

    device.pendingPipeline = newB64;
    device.pendingPipelineAt = new Date();
    device.currentPipeline = newB64;
    device.settingsSavedAt = new Date();
    await deviceRepo.save(device);

    // Save config history snapshot so the change appears in config-history
    const configRepo = AppDataSource.getRepository(DeviceConfig);
    const snapshot = configRepo.create({
      deviceId: device.id,
      firmwareVersion: device.firmwareVersion ?? '',
      config: { source: 'pipeline-settings', l3Bytes: newL3.length, pipelines },
      submittedBy: userId,
    });
    await configRepo.save(snapshot);
    // Enforce cap
    const snapCount = await configRepo.count({ where: { deviceId: device.id } });
    if (snapCount > MAX_CONFIG_SNAPSHOTS) {
      const excess = await configRepo.find({
        where: { deviceId: device.id },
        order: { createdAt: "ASC" },
        take: snapCount - MAX_CONFIG_SNAPSHOTS,
      });
      if (excess.length > 0) await configRepo.remove(excess);
    }

    // Return the freshly decoded settings so the UI can reflect the saved state
    const decoded = decodeSettings(l1, newL3);
    res.json({ queued: true, settings: decoded });
  } catch (err: any) {
    console.error("PATCH /devices/:id/pipeline-settings error:", err);
    res.status(500).json({ error: "Failed to update pipeline settings" });
  }
});

/**
 * POST /v1/devices/:id/command — Queue a single command to the device.
 * Body types:
 *   pwm:                { type: 'pwm', pin, value }  — value 0–1000
 *   gpio:               { type: 'gpio', pin, value }  — value 0 or 1
 *   hmi_toggle:         { type: 'hmi_toggle', pipelineIndex, blockIndex, value: boolean }
 *   hmi_momentary:      { type: 'hmi_momentary', pipelineIndex, blockIndex }
 *   hmi_initiate:       { type: 'hmi_initiate', pipelineIndex, blockIndex }
 *   timer_force_expire: { type: 'timer_force_expire', pipelineIndex, blockIndex }
 *   reset_cumulative:   { type: 'reset_cumulative', pipelineIndex, blockIndex }
 * Device picks it up on its next poll of GET /v1/devices/:id/pending-command.
 */
router.post("/:id/command", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    const { type, pin, value, pipelineIndex, blockIndex } = req.body || {};
    if (!["pwm", "gpio", "hmi_toggle", "hmi_momentary", "hmi_initiate", "timer_force_expire", "reset_cumulative"].includes(type)) {
      return res.status(400).json({ error: "type must be 'pwm', 'gpio', 'hmi_toggle', 'hmi_momentary', 'hmi_initiate', 'timer_force_expire', or 'reset_cumulative'" });
    }

    if (type === "pwm" || type === "gpio") {
      if (typeof pin !== "number" || typeof value !== "number") {
        return res.status(400).json({ error: "pwm/gpio commands require numeric pin and value" });
      }
      if (type === "pwm" && (value < 0 || value > 1000)) {
        return res.status(400).json({ error: "PWM value must be 0–1000" });
      }
      if (type === "gpio" && value !== 0 && value !== 1) {
        return res.status(400).json({ error: "GPIO value must be 0 or 1" });
      }
    } else if (type === "hmi_toggle") {
      if (typeof pipelineIndex !== "number" || typeof blockIndex !== "number" || typeof value !== "boolean") {
        return res.status(400).json({ error: "hmi_toggle requires numeric pipelineIndex, blockIndex, and boolean value" });
      }
    } else if (type === "hmi_momentary" || type === "hmi_initiate" ||
               type === "timer_force_expire" || type === "reset_cumulative") {
      if (typeof pipelineIndex !== "number" || typeof blockIndex !== "number") {
        return res.status(400).json({ error: `${type} requires numeric pipelineIndex and blockIndex` });
      }
    }

    device.pendingCommand = type === "hmi_toggle"
      ? { type, pipelineIndex, blockIndex, value }
      : (type === "hmi_momentary" || type === "hmi_initiate" ||
         type === "timer_force_expire" || type === "reset_cumulative")
      ? { type, pipelineIndex, blockIndex }
      : { type, pin, value };
    await deviceRepo.save(device);
    res.json({ queued: true });
  } catch (err: any) {
    console.error("POST /devices/:id/command error:", err);
    res.status(500).json({ error: "Failed to queue command" });
  }
});

/**
 * GET /v1/devices/:id/pending-command — Device polls for a queued command.
 * Auth: X-Device-Token header (device firmware).
 * Returns 204 when nothing is pending.
 * Returns 200 with JSON command when one is queued — clears it after delivery.
 */
router.get("/:id/pending-command", verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const authDevice = (req as any).authenticatedDevice as Device;
    if (authDevice.id !== req.params.id) {
      return res.status(403).json({ error: "Token does not match device ID" });
    }

    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    device.lastSeenAt = new Date();

    if (!device.pendingCommand) {
      await deviceRepo.save(device);
      return res.status(204).end();
    }

    const cmd = device.pendingCommand;
    device.pendingCommand = null;
    await deviceRepo.save(device);

    res.json(cmd);
  } catch (err: any) {
    console.error("GET /devices/:id/pending-command error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * GET /v1/devices/:id/available-firmware — List firmware versions available for this device.
 * Queries FwServer via the internal proxy and returns metadata for each version.
 * Used by VersionScreen to populate the version picker.
 */
router.get("/:id/available-firmware", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    const FW_SERVER_URL = (process.env.FW_SERVER_URL || "http://localhost:3002").replace(/\/$/, "");
    const fwEndpoint = device.board && device.hwrev
      ? `${FW_SERVER_URL}/v1/firmware/${device.board}/${device.hwrev}/${device.deviceType}`
      : `${FW_SERVER_URL}/v1/firmware?deviceType=${device.deviceType}`;
    const fwRes = await fetch(fwEndpoint, { headers: { Accept: "application/json" } });
    if (!fwRes.ok) return res.status(502).json({ error: "Could not reach firmware server" });
    const versions = await fwRes.json();
    res.json({ deviceType: device.deviceType, board: device.board, hwrev: device.hwrev, installedVersion: device.firmwareVersion, versions });
  } catch (err: any) {
    console.error("GET /devices/:id/available-firmware error:", err);
    res.status(500).json({ error: "Failed to fetch firmware versions" });
  }
});

/**
 * POST /v1/devices/admin/:id/ota — Admin: queue a firmware OTA for any device regardless of ownership.
 * Body: { version: string }
 * Used by cloud batch-deploy tooling where the admin user doesn't own the target devices.
 */
router.post("/admin/:id/ota", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    const { version } = req.body || {};
    if (!version) return res.status(400).json({ error: "version is required" });

    const baseUrl = process.env.BASE_URL
      ? process.env.BASE_URL.replace(/\/$/, "")
      : `${(req.headers["x-forwarded-proto"] as string) || req.protocol}://${(req.headers["x-forwarded-host"] as string) || req.get("host")}`;
    const fwSegment = device.board && device.hwrev
      ? `${device.board}/${device.hwrev}/${device.deviceType}/${version}`
      : `${device.deviceType}/${version}`;
    const downloadUrl = `${baseUrl}/v1/firmware/${fwSegment}/device-download`;

    await deviceRepo.update(device.id, {
      pendingOtaVersion: version,
      pendingOtaUrl: downloadUrl,
    });
    res.json({ queued: true, version, url: downloadUrl, deviceId: device.id });
  } catch (err: any) {
    console.error("POST /devices/admin/:id/ota error:", err);
    res.status(500).json({ error: "Failed to queue OTA" });
  }
});

/**
 * POST /v1/devices/:id/ota — Queue a firmware OTA update.
 * Body: { version: string }
 * The download URL is constructed internally pointing to the HMI API's
 * device-download proxy, which verifies X-Device-Token and forwards to FwServer.
 * Device receives otaUrl on its next GET /v1/devices/:id/pending-sync poll.
 */
router.post("/:id/ota", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id, ownerId: userId } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    const { version } = req.body || {};
    if (!version) {
      return res.status(400).json({ error: "version is required" });
    }

    // Build the download URL pointing at our own device-download proxy so the
    // device can authenticate with X-Device-Token instead of a user JWT.
    // Prefer BASE_URL env var (set to the LAN-reachable address in dev) so the
    // URL is correct even when this request arrives via localhost.
    const baseUrl = process.env.BASE_URL
      ? process.env.BASE_URL.replace(/\/$/, "")
      : `${(req.headers["x-forwarded-proto"] as string) || req.protocol}://${(req.headers["x-forwarded-host"] as string) || req.get("host")}`;
    const fwSegment = device.board && device.hwrev
      ? `${device.board}/${device.hwrev}/${device.deviceType}/${version}`
      : `${device.deviceType}/${version}`;
    const downloadUrl = `${baseUrl}/v1/firmware/${fwSegment}/device-download`;

    await deviceRepo.update(device.id, {
      pendingOtaVersion: version,
      pendingOtaUrl: downloadUrl,
    });
    res.json({ queued: true, version, url: downloadUrl });
  } catch (err: any) {
    console.error("POST /devices/:id/ota error:", err);
    res.status(500).json({ error: "Failed to queue OTA" });
  }
});

/**
 * POST /v1/devices/:id/ota/ack — Device ACKs a completed OTA download.
 * Body: { status: 'ok' | 'error', error?: string }
 * Clears pendingOtaUrl and pendingOtaVersion on the device record.
 */
router.post("/:id/ota/ack", verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const authDevice = (req as any).authenticatedDevice as Device;
    if (authDevice.id !== req.params.id) {
      return res.status(403).json({ error: "Token does not match device ID" });
    }

    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    const { status, error: errMsg } = req.body || {};
    const updateFields: Record<string, any> = {
      pendingOtaUrl: null,
      pendingOtaVersion: null,
      lastSeenAt: new Date(),
    };
    if (status === "ok" && device.pendingOtaVersion) {
      updateFields.firmwareVersion = device.pendingOtaVersion;
    }
    await deviceRepo.update(device.id, updateFields);

    if (status === "ok") {
      console.log(`[ota/ack] Device ${device.id} OTA applied successfully → firmwareVersion=${device.pendingOtaVersion}`);
    } else {
      console.warn(`[ota/ack] Device ${device.id} OTA FAILED: ${errMsg}`);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error("POST /devices/:id/ota/ack error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin: factory-reset and full-delete
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /v1/devices/admin/:id/factory-reset
 * Clears all telemetry logs, config history, pipeline data, and live-state from
 * the device record. The device record itself (id, deviceToken, serialNumber,
 * deviceType, ownerId) is preserved so the physical device can still authenticate.
 *
 * Use before a fresh e2e deploy to guarantee no stale data on the server.
 */
router.post("/admin/:id/factory-reset", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deviceRepo = AppDataSource.getRepository(Device);
    const telRepo    = AppDataSource.getRepository(TelemetryLog);
    const configRepo = AppDataSource.getRepository(DeviceConfig);

    const device = await deviceRepo.findOne({ where: { id: req.params.id } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    // Delete all telemetry rows for this device
    await telRepo.delete({ deviceId: device.id });

    // Delete all config snapshots for this device
    await configRepo.delete({ deviceId: device.id });

    // Clear all pipeline + config + live-state columns
    device.pendingPipeline    = null as any;
    device.pendingPipelineAt  = null as any;
    device.currentPipeline    = null as any;
    device.pipelineMeta       = null as any;
    device.currentConfig      = null as any;
    device.pendingConfig      = null as any;
    device.liveState          = null as any;
    device.lastSeenAt         = null as any;
    device.pendingSyncRequest = false;
    await deviceRepo.save(device);

    res.json({ ok: true, deviceId: device.id, message: "Device factory-reset — all logs, pipeline, and config data cleared." });
  } catch (err: any) {
    console.error("POST /devices/admin/:id/factory-reset error:", err);
    res.status(500).json({ error: "Factory reset failed" });
  }
});

/**
 * DELETE /v1/devices/admin/:id
 * Fully deletes a device record. Cascades delete all telemetry logs and config
 * snapshots automatically (defined on entity FK). The physical device will lose
 * its authentication — the NVS must be reflashed to re-register.
 */
router.delete("/admin/:id", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    await deviceRepo.remove(device);
    res.json({ ok: true, message: `Device ${req.params.id} deleted.` });
  } catch (err: any) {
    console.error("DELETE /devices/admin/:id error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

/**
 * PATCH /v1/devices/:id/control-point
 *
 * Device-authenticated endpoint. Called by encoder_mapped blocks after a
 * control-point value has settled (no change for 10 s). Patches the target
 * field in the stored L3 and queues a pending pipeline push so the value
 * survives a reboot.
 *
 * Body: { pipeline: number, block: number, fieldIdx: number, value: number }
 */
router.patch("/:id/control-point", verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const authDevice = (req as any).authenticatedDevice as Device;
    if (authDevice.id !== req.params.id) {
      return res.status(403).json({ error: "Token does not match device ID" });
    }

    const { pipeline, block, fieldIdx, value } = req.body || {};
    if (typeof pipeline !== "number" || typeof block !== "number" ||
        typeof fieldIdx !== "number" || typeof value !== "number") {
      return res.status(400).json({ error: "Body must contain pipeline, block, fieldIdx, value (all numbers)" });
    }

    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: req.params.id } });
    if (!device) return res.status(404).json({ error: "Device not found" });

    if (!device.currentPipeline) {
      return res.status(404).json({ error: "No pipeline stored for this device" });
    }

    const framed = Buffer.from(device.currentPipeline, "base64");
    const { l1, l2, l3 } = unframePipeline(framed);
    const decoded = decodeSettings(l1, l3);

    const tgtPipeline = decoded.pipelines.find(p => p.index === pipeline);
    if (!tgtPipeline) {
      return res.status(400).json({ error: `Pipeline index ${pipeline} not found` });
    }
    const tgtBlock = tgtPipeline.blocks.find(b => b.index === block);
    if (!tgtBlock) {
      return res.status(400).json({ error: `Block index ${block} not found in pipeline ${pipeline}` });
    }

    const entry = BLOCK_REGISTRY[tgtBlock.blockType];
    if (!entry?.l3Fields) {
      return res.status(400).json({ error: `Block type ${tgtBlock.blockType} has no L3 fields` });
    }
    const fieldName = entry.l3Fields[fieldIdx];
    if (!fieldName) {
      return res.status(400).json({ error: `Field index ${fieldIdx} out of range for ${tgtBlock.blockType}` });
    }

    const newL3 = encodeSettings(l1, l3, [{
      index: pipeline,
      blocks: [{ index: block, blockType: tgtBlock.blockType, settings: { [fieldName]: { value } } }],
    }]);
    const newFramed = framePipeline(l1, l2, newL3);
    const newB64 = newFramed.toString("base64");

    device.pendingPipeline    = newB64;
    device.pendingPipelineAt  = new Date();
    device.currentPipeline    = newB64;
    device.settingsSavedAt    = new Date();
    await deviceRepo.save(device);

    // Config history snapshot
    const configRepo = AppDataSource.getRepository(DeviceConfig);
    const snapshot = configRepo.create({
      deviceId: device.id,
      firmwareVersion: device.firmwareVersion ?? '',
      config: { source: 'control-point-settle', pipeline, block, fieldIdx, fieldName, value },
      submittedBy: 'device',
    });
    await configRepo.save(snapshot);
    // Enforce snapshot cap
    const snapCount = await configRepo.count({ where: { deviceId: device.id } });
    if (snapCount > MAX_CONFIG_SNAPSHOTS) {
      const excess = await configRepo.find({
        where: { deviceId: device.id },
        order: { createdAt: "ASC" },
        take: snapCount - MAX_CONFIG_SNAPSHOTS,
      });
      if (excess.length > 0) await configRepo.remove(excess);
    }

    res.json({ queued: true, pipeline, block, fieldName, value });
  } catch (err: any) {
    console.error("PATCH /devices/:id/control-point error:", err);
    res.status(500).json({ error: "Failed to update control point" });
  }
});

export default router;

