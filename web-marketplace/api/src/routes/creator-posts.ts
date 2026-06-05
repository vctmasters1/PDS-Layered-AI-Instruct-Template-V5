import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import rateLimit from "express-rate-limit";
import AppDataSource from "../database.js";
import { CreatorPost } from "../entities/creator-post.js";
import { CreatorPostLike } from "../entities/creator-post-like.js";
import { CreatorPostComment } from "../entities/creator-post-comment.js";
import { Designer } from "../entities/designer.js";
import { Producer } from "../entities/producer.js";
import { User } from "../entities/user.js";
import { verifyToken } from "./auth.js";

const router = Router();
const NODE_ENV = process.env.NODE_ENV || "development";

const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: NODE_ENV === "production" ? 20 : 500,
  message: "Too many posts. Try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const MAX_IMAGES_PER_POST = 4;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseImageUrls(raw: string): string[] {
  try { return JSON.parse(raw) ?? []; } catch { return []; }
}

/** Verify that req.user owns the designer or producer record for creatorType/creatorId */
async function assertOwnsProfile(
  userId: string,
  creatorType: string,
  creatorId: string,
): Promise<boolean> {
  if (creatorType === "designer") {
    const repo = AppDataSource.getRepository(Designer);
    const d = await repo.findOne({ where: { id: creatorId } as any });
    return !!(d && (d as any).userId === userId);
  }
  if (creatorType === "producer") {
    const repo = AppDataSource.getRepository(Producer);
    const p = await repo.findOne({ where: { id: creatorId } as any });
    return !!(p && (p as any).userId === userId);
  }
  return false;
}

function formatPost(post: CreatorPost, likedByMe: boolean, authorName?: string | null) {
  return {
    id: post.id,
    creatorType: post.creatorType,
    creatorId: post.creatorId,
    userId: post.userId,
    authorName: authorName ?? null,
    title: post.title,
    content: post.content,
    imageUrls: parseImageUrls(post.imageUrls),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    likedByMe,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

// ─── GET /v1/creator-posts/:type/:id ─────────────────────────────────────────
// Public — list posts for a creator profile, newest first

router.get("/:type/:id", async (req: Request, res: Response) => {
  const { type, id } = req.params;
  if (!["designer", "producer"].includes(type)) {
    return res.status(400).json({ error: "Invalid creator type" });
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  // Optionally decode who's viewing to populate likedByMe
  let viewerUserId: string | null = null;
  try {
    await new Promise<void>((resolve) => {
      verifyToken(req as any, res as any, () => resolve());
    });
    viewerUserId = (req as any).user?.id ?? null;
  } catch {
    // not authenticated — that's fine
  }

  try {
    const repo = AppDataSource.getRepository(CreatorPost);
    const [posts, total] = await repo.findAndCount({
      where: { creatorType: type, creatorId: id, deletedAt: null as any },
      order: { createdAt: "DESC" },
      skip: offset,
      take: limit,
    });

    // Batch-fetch liked status
    let likedPostIds = new Set<string>();
    if (viewerUserId && posts.length > 0) {
      const likeRepo = AppDataSource.getRepository(CreatorPostLike);
      const likes = await likeRepo.find({
        where: posts.map((p) => ({ postId: p.id, userId: viewerUserId! })) as any,
      });
      likedPostIds = new Set(likes.map((l) => l.postId));
    }

    // Fetch author display names
    const userIds = [...new Set(posts.map((p) => p.userId))];
    const userRepo = AppDataSource.getRepository(User);
    const users = userIds.length
      ? await userRepo.findByIds(userIds)
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = posts.map((p) => {
      const u = userMap.get(p.userId);
      const authorName = (u as any)?.displayName || (u as any)?.firstName
        ? `${(u as any).firstName ?? ""} ${(u as any).lastName ?? ""}`.trim()
        : null;
      return formatPost(p, likedPostIds.has(p.id), authorName);
    });

    res.json({
      posts: result,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET creator-posts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /v1/creator-posts ───────────────────────────────────────────────────
// Auth required — create a post on your own creator profile

router.post(
  "/",
  postLimiter,
  verifyToken as any,
  upload.array("images", MAX_IMAGES_PER_POST),
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { creatorType, creatorId, title, content } = req.body;

    if (!creatorType || !creatorId || !content?.trim()) {
      return res.status(400).json({ error: "creatorType, creatorId, and content are required" });
    }

    if (!(await assertOwnsProfile(userId, creatorType, creatorId))) {
      return res.status(403).json({ error: "You can only post on your own profile" });
    }

    // Process uploaded images
    const files = req.files as Express.Multer.File[] | undefined;
    const imageUrls: string[] = [];
    for (const file of files ?? []) {
      const filename = `post_${userId}_${uuidv4()}.webp`;
      const filepath = path.join(uploadsDir, filename);
      await sharp(file.buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(filepath);
      imageUrls.push(`/uploads/${filename}`);
    }

    const repo = AppDataSource.getRepository(CreatorPost);
    const post = repo.create({
      creatorType,
      creatorId,
      userId,
      title: title?.trim() || null,
      content: content.trim(),
      imageUrls: JSON.stringify(imageUrls),
    });
    await repo.save(post);

    res.status(201).json(formatPost(post, false));
  },
);

// ─── DELETE /v1/creator-posts/:postId ────────────────────────────────────────

router.delete("/:postId", verifyToken as any, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { postId } = req.params;

  const repo = AppDataSource.getRepository(CreatorPost);
  const post = await repo.findOne({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.userId !== userId && !(req as any).user?.isStaff) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Delete uploaded images from disk
  const urls = parseImageUrls(post.imageUrls);
  for (const url of urls) {
    const filename = url.replace("/uploads/", "");
    const filepath = path.join(uploadsDir, filename);
    try { fs.unlinkSync(filepath); } catch { /* already gone */ }
  }

  await repo.softDelete(postId);
  res.json({ ok: true });
});

// ─── POST /v1/creator-posts/:postId/like ─────────────────────────────────────
// Toggle like on/off

router.post("/:postId/like", verifyToken as any, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { postId } = req.params;

  const postRepo = AppDataSource.getRepository(CreatorPost);
  const likeRepo = AppDataSource.getRepository(CreatorPostLike);

  const post = await postRepo.findOne({ where: { id: postId, deletedAt: null as any } });
  if (!post) return res.status(404).json({ error: "Post not found" });

  const existing = await likeRepo.findOne({ where: { postId, userId } });

  if (existing) {
    await likeRepo.delete({ postId, userId });
    await postRepo.decrement({ id: postId }, "likeCount", 1);
    return res.json({ liked: false, likeCount: Math.max(0, post.likeCount - 1) });
  } else {
    const like = likeRepo.create({ postId, userId });
    await likeRepo.save(like);
    await postRepo.increment({ id: postId }, "likeCount", 1);
    return res.json({ liked: true, likeCount: post.likeCount + 1 });
  }
});

// ─── GET /v1/creator-posts/:postId/comments ──────────────────────────────────

router.get("/:postId/comments", async (req: Request, res: Response) => {
  const { postId } = req.params;
  const limit = 50;

  const commentRepo = AppDataSource.getRepository(CreatorPostComment);
  const comments = await commentRepo.find({
    where: { postId, deletedAt: null as any },
    order: { createdAt: "ASC" },
    take: limit,
  });

  // Fetch author names
  const userIds = [...new Set(comments.map((c) => c.userId))];
  const userRepo = AppDataSource.getRepository(User);
  const users = userIds.length ? await userRepo.findByIds(userIds) : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const result = comments.map((c) => {
    const u = userMap.get(c.userId);
    const authorName = (u as any)?.displayName
      || ((u as any)?.firstName ? `${(u as any).firstName ?? ""} ${(u as any).lastName ?? ""}`.trim() : null)
      || "User";
    return {
      id: c.id,
      postId: c.postId,
      userId: c.userId,
      authorName,
      content: c.content,
      createdAt: c.createdAt,
    };
  });

  res.json({ comments: result });
});

// ─── POST /v1/creator-posts/:postId/comments ─────────────────────────────────

router.post("/:postId/comments", verifyToken as any, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { postId } = req.params;
  const { content } = req.body;

  if (!content?.trim()) return res.status(400).json({ error: "Comment cannot be empty" });
  if (content.trim().length > 2000) return res.status(400).json({ error: "Comment too long (max 2000 chars)" });

  const postRepo = AppDataSource.getRepository(CreatorPost);
  const post = await postRepo.findOne({ where: { id: postId, deletedAt: null as any } });
  if (!post) return res.status(404).json({ error: "Post not found" });

  const commentRepo = AppDataSource.getRepository(CreatorPostComment);
  const comment = commentRepo.create({ postId, userId, content: content.trim() });
  await commentRepo.save(comment);
  await postRepo.increment({ id: postId }, "commentCount", 1);

  const userRepo = AppDataSource.getRepository(User);
  const u = await userRepo.findOne({ where: { id: userId } });
  const authorName = (u as any)?.displayName
    || ((u as any)?.firstName ? `${(u as any).firstName ?? ""} ${(u as any).lastName ?? ""}`.trim() : null)
    || "User";

  res.status(201).json({
    id: comment.id,
    postId: comment.postId,
    userId: comment.userId,
    authorName,
    content: comment.content,
    createdAt: comment.createdAt,
  });
});

// ─── DELETE /v1/creator-posts/:postId/comments/:commentId ────────────────────

router.delete("/:postId/comments/:commentId", verifyToken as any, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { postId, commentId } = req.params;

  const commentRepo = AppDataSource.getRepository(CreatorPostComment);
  const postRepo = AppDataSource.getRepository(CreatorPost);

  const comment = await commentRepo.findOne({ where: { id: commentId, postId } });
  if (!comment) return res.status(404).json({ error: "Comment not found" });

  const post = await postRepo.findOne({ where: { id: postId } });
  const isOwner = comment.userId === userId;
  const isPostAuthor = post?.userId === userId;
  const isStaff = (req as any).user?.isStaff;

  if (!isOwner && !isPostAuthor && !isStaff) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await commentRepo.softDelete(commentId);
  await postRepo.decrement({ id: postId }, "commentCount", 1);
  res.json({ ok: true });
});

export default router;
