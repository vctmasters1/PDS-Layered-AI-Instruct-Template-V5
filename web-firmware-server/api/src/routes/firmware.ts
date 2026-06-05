import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { createHash, randomUUID } from "crypto";
import { AppDataSource } from "../database.js";
import { Firmware } from "../entities/firmware.js";
import { verifyToken } from "../middleware/auth.js";
import { adminOnly } from "../middleware/adminOnly.js";

const router = Router();

// In-memory storage — we write to disk manually after computing the checksum
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Firmware binary files live here: STORAGE_DIR/{board}/{hwrev}/{deviceType}/{version}/{filename}
const STORAGE_DIR =
  process.env.STORAGE_DIR || path.resolve(process.cwd(), "..", "storage");

// ─── List all firmware (?board= ?hwrev= ?deviceType= ?activeOnly=true) ──

router.get("/", verifyToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const qb = AppDataSource.getRepository(Firmware)
      .createQueryBuilder("fw")
      .orderBy("fw.board", "ASC")
      .addOrderBy("fw.hwrev", "ASC")
      .addOrderBy("fw.deviceType", "ASC")
      .addOrderBy("fw.releasedAt", "DESC");

    if (req.query.board)   qb.andWhere("fw.board = :p",  { p:  req.query.board });
    if (req.query.hwrev)      qb.andWhere("fw.hwrev = :h",     { h:  req.query.hwrev });
    if (req.query.deviceType) qb.andWhere("fw.deviceType = :dt", { dt: req.query.deviceType });
    if (req.query.activeOnly === "true") qb.andWhere("fw.active = true");

    res.json(await qb.getMany());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── List versions for a specific target (:board/:hwrev/:deviceType) ────

router.get("/:board/:hwrev/:deviceType", verifyToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { board, hwrev, deviceType } = req.params;
    const firmware = await AppDataSource.getRepository(Firmware).find({
      where: { board: board, hwrev, deviceType, ...(req.query.activeOnly === "true" ? { active: true } : {}) },
      order: { releasedAt: "DESC" },
    });
    res.json(firmware);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get metadata for a specific version ────────────────────────────────────

router.get("/:board/:hwrev/:deviceType/:version", verifyToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { board, hwrev, deviceType, version } = req.params;
    const fw = await AppDataSource.getRepository(Firmware).findOne({
      where: { board: board, hwrev, deviceType, version },
    });
    if (!fw) { res.status(404).json({ error: "Firmware not found" }); return; }
    res.json(fw);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Download binary ─────────────────────────────────────────────────────────
// Localhost callers (HMI proxy doing device-to-device OTA) skip JWT — they are
// internal service-to-service requests that have already authenticated the device.
// If FW_INTERNAL_SECRET is set, the caller must also provide X-Internal-Secret
// to prevent unauthenticated access via SSRF or misconfigured reverse proxies.

function localOrVerifyToken(req: Request, res: Response, next: any): void {
  const ip = req.ip || req.socket.remoteAddress || "";
  const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (isLocal) {
    const configuredSecret = process.env.FW_INTERNAL_SECRET;
    if (!configuredSecret || req.headers["x-internal-secret"] === configuredSecret) {
      next();
      return;
    }
  }
  verifyToken(req, res, next);
}

router.get("/:board/:hwrev/:deviceType/:version/download", localOrVerifyToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { board, hwrev, deviceType, version } = req.params;
    const fw = await AppDataSource.getRepository(Firmware).findOne({
      where: { board: board, hwrev, deviceType, version, active: true },
    });
    if (!fw) { res.status(404).json({ error: "Firmware not found or inactive" }); return; }

    const filePath = path.resolve(STORAGE_DIR, fw.binaryPath);
    // Prevent path traversal: resolved path must stay inside STORAGE_DIR
    const resolvedStorage = path.resolve(STORAGE_DIR);
    if (!filePath.startsWith(resolvedStorage + path.sep) && filePath !== resolvedStorage) {
      res.status(400).json({ error: "Invalid firmware path" });
      return;
    }
    res.setHeader("X-Firmware-SHA256", fw.sha256);
    res.setHeader("X-Firmware-Size", fw.binarySize.toString());
    res.download(filePath, path.basename(fw.binaryPath));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Upload new firmware (admin only) ────────────────────────────────────────
// POST /v1/firmware
// Form fields: board, hwrev, deviceType, version, [minPreviousVersion], [changelog]
// File field:  file  (the binary)

router.post(
  "/",
  verifyToken,
  adminOnly,
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { board, hwrev, deviceType, version, minPreviousVersion, changelog } = req.body;

      if (!board || !hwrev || !deviceType || !version) {
        res.status(400).json({ error: "board, hwrev, deviceType and version are required" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Firmware file is required (field: file)" });
        return;
      }

      // Reject duplicate
      const existing = await AppDataSource.getRepository(Firmware).findOne({
        where: { board: board, hwrev, deviceType, version },
      });
      if (existing) {
        res.status(409).json({ error: `Firmware ${board}/${hwrev}/${deviceType}@${version} already exists` });
        return;
      }

      // Validate firmware magic byte — ESP32 images always begin with 0xE9
      // Reject anything that doesn't match to prevent accidental uploads of wrong files.
      if (!req.file.buffer.length || req.file.buffer[0] !== 0xe9) {
        res.status(400).json({ error: "Invalid firmware file: not a valid ESP32 image (expected 0xE9 magic byte)" });
        return;
      }

      // Compute integrity hash
      const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");

      // Sanitize filename and prefix with a UUID to prevent collisions — two uploads
      // with the same original name will never overwrite each other.
      const sanitized = path.basename(req.file.originalname).replace(/[^\w.\-]/g, "_");
      const safeFilename = `${randomUUID()}_${sanitized}`;

      // Write binary to STORAGE_DIR/{board}/{hwrev}/{deviceType}/{version}/{safeFilename}
      const destDir = path.join(STORAGE_DIR, board, hwrev, deviceType, version);
      await fs.mkdir(destDir, { recursive: true });
      const destPath = path.join(destDir, safeFilename);
      await fs.writeFile(destPath, req.file.buffer);

      // Store a relative path (portable across machines and deployments)
      const binaryPath = path.join(board, hwrev, deviceType, version, safeFilename);

      const repo = AppDataSource.getRepository(Firmware);
      const fw = repo.create({
        board: board,
        hwrev,
        deviceType,
        version,
        minPreviousVersion: minPreviousVersion || null,
        changelog: changelog || null,
        binaryPath,
        binarySize: req.file.size,
        sha256,
        active: true,
      });
      await repo.save(fw);

      res.status(201).json(fw);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── Update firmware metadata (admin only) ───────────────────────────────────
// PATCH /v1/firmware/:id
// Allowed fields: changelog, minPreviousVersion, active

router.patch("/:id", verifyToken, adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const repo = AppDataSource.getRepository(Firmware);
    const fw = await repo.findOne({ where: { id: req.params.id } });
    if (!fw) { res.status(404).json({ error: "Firmware not found" }); return; }

    const { changelog, minPreviousVersion, active } = req.body;
    if (changelog !== undefined) fw.changelog = changelog;
    if (minPreviousVersion !== undefined) fw.minPreviousVersion = minPreviousVersion;
    if (active !== undefined) fw.active = Boolean(active);

    await repo.save(fw);
    res.json(fw);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete firmware record + binary (admin only) ────────────────────────────

router.delete("/:id", verifyToken, adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const repo = AppDataSource.getRepository(Firmware);
    const fw = await repo.findOne({ where: { id: req.params.id } });
    if (!fw) { res.status(404).json({ error: "Firmware not found" }); return; }

    // Best-effort removal of the binary file
    try {
      const filePath = path.resolve(STORAGE_DIR, fw.binaryPath);
      await fs.unlink(filePath);
      // Remove the version directory if now empty
      const versionDir = path.dirname(filePath);
      const remaining = await fs.readdir(versionDir);
      if (remaining.length === 0) await fs.rmdir(versionDir);
    } catch {
      // File may already be missing — non-fatal
    }

    await repo.delete(fw.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
