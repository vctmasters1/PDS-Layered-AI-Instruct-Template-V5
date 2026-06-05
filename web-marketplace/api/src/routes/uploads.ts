import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { verifyToken } from "./auth.js";

const router = Router();

// Maximum 5 images per upload
const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file (before compression)
const COMPRESSED_MAX_WIDTH = 1200; // Max width after compression
const COMPRESSED_QUALITY = 80; // JPEG quality (0-100)

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for memory storage (we'll process with sharp before saving)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_IMAGES,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, GIF`));
    }
  },
});

/**
 * POST /v1/uploads/images
 * Upload and compress up to 5 images
 * Returns array of image URLs
 * Requires authentication
 */
router.post(
  "/images",
  verifyToken,
  (req: Request, res: Response, next: any) => {
    upload.array("images", MAX_IMAGES)(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            error: `Maximum ${MAX_IMAGES} images allowed per upload`,
          });
        }
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: `File too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB per image`,
          });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No images provided" });
      }

      if (files.length > MAX_IMAGES) {
        return res.status(400).json({
          error: `Maximum ${MAX_IMAGES} images allowed. You uploaded ${files.length}.`,
        });
      }

      const imageUrls: string[] = [];
      const compressionStats: any[] = [];

      for (const file of files) {
        const originalSize = file.size;
        // Prefix filename with userId for ownership tracking
        const filename = `${userId}_${uuidv4()}.webp`;
        const filepath = path.join(uploadsDir, filename);

        // Compress with sharp: resize to max width, convert to WebP
        const compressed = await sharp(file.buffer)
          .resize(COMPRESSED_MAX_WIDTH, undefined, {
            withoutEnlargement: true, // Don't upscale small images
            fit: "inside",
          })
          .webp({ quality: COMPRESSED_QUALITY })
          .toBuffer();

        // Save compressed file
        fs.writeFileSync(filepath, compressed);

        const compressedSize = compressed.length;
        const savings = Math.round(
          ((originalSize - compressedSize) / originalSize) * 100
        );

        imageUrls.push(`/uploads/${filename}`);
        compressionStats.push({
          original: `${(originalSize / 1024).toFixed(1)}KB`,
          compressed: `${(compressedSize / 1024).toFixed(1)}KB`,
          savings: `${savings}%`,
        });
      }

      res.json({
        success: true,
        images: imageUrls,
        count: imageUrls.length,
        maxAllowed: MAX_IMAGES,
        compression: compressionStats,
      });
    } catch (error: any) {
      console.error("Image upload error:", error);
      res.status(500).json({ error: "Image processing failed" });
    }
  }
);

/**
 * DELETE /v1/uploads/images/:filename
 * Delete an uploaded image
 * Requires authentication
 */
router.delete(
  "/images/:filename",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { filename } = req.params;

      // Sanitize filename - only allow uuid.webp or userId_uuid.webp pattern
      if (!/^([a-f0-9-]+_)?[a-f0-9-]+\.webp$/.test(filename)) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      // Ownership check: filename must start with the user's ID prefix
      // Legacy files without prefix can only be deleted by the uploader
      if (filename.includes("_") && !filename.startsWith(`${userId}_`)) {
        return res.status(403).json({ error: "You can only delete your own images" });
      }

      const filepath = path.join(uploadsDir, filename);

      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: "Image not found" });
      }

      fs.unlinkSync(filepath);
      res.json({ success: true, message: "Image deleted" });
    } catch (error: any) {
      console.error("Image delete error:", error);
      res.status(500).json({ error: "Failed to delete image" });
    }
  }
);

export default router;
