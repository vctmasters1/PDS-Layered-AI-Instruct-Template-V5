import { Router, Request, Response } from "express";
import Stripe from "stripe";
import rateLimit from "express-rate-limit";
import AppDataSource from "../database.js";
import { BulletinCard, BulletinCardStatus } from "../entities/bulletin-card.js";
import { User } from "../entities/user.js";
import { verifyToken } from "./auth.js";
import { invoiceService } from "../services/invoiceService.js";
import { InvoiceType } from "../entities/invoice.js";
import stripe from "../config/stripe.js";

const router = Router();

const NODE_ENV = process.env.NODE_ENV || "development";

// Rate limiter for card creation (prevent spam)
const postCardLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: NODE_ENV === "production" ? 10 : 500, // strict in prod, lenient in dev/test
  message: "Too many card posts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Default and allowed page sizes
const DEFAULT_PAGE_SIZE = 50;
const ALLOWED_PAGE_SIZES = [50, 100, 150, 200];

/**
 * GET /v1/bulletin-board
 * List active bulletin cards with pagination
 * Query: ?page=1&pageSize=50&search=&section=both|pipedream|offers
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    let pageSize = parseInt(req.query.pageSize as string) || DEFAULT_PAGE_SIZE;
    if (!ALLOWED_PAGE_SIZES.includes(pageSize)) {
      pageSize = DEFAULT_PAGE_SIZE;
    }

    const search = (req.query.search as string || "").trim();
    const section = (req.query.section as string || "both").toLowerCase();

    const qb = AppDataSource.getRepository(BulletinCard)
      .createQueryBuilder("card")
      .leftJoinAndSelect("card.user", "user")
      .where("card.status = :status", { status: BulletinCardStatus.ACTIVE })
      .andWhere("card.active = :active", { active: true });

    // Search filter
    if (search) {
      const searchParam = `%${search}%`;

      if (section === "pipedream") {
        qb.andWhere("card.myPipedream ILIKE :search", { search: searchParam });
      } else if (section === "offers") {
        qb.andWhere("card.whatIHaveToOffer ILIKE :search", { search: searchParam });
      } else {
        // "both" — search across both sections and title
        qb.andWhere(
          "(card.myPipedream ILIKE :search OR card.whatIHaveToOffer ILIKE :search OR card.title ILIKE :search)",
          { search: searchParam }
        );
      }
    }

    // Filter out expired cards
    qb.andWhere("(card.expiresAt IS NULL OR card.expiresAt > :now)", { now: new Date() });

    // Count total before pagination
    const total = await qb.getCount();

    // Paginate — newest first
    const offset = (page - 1) * pageSize;
    const cards = await qb
      .orderBy("card.createdAt", "DESC")
      .skip(offset)
      .take(pageSize)
      .getMany();

    // Strip sensitive user data
    const sanitizedCards = cards.map((card) => ({
      id: card.id,
      title: card.title,
      myPipedream: card.myPipedream,
      whatIHaveToOffer: card.whatIHaveToOffer,
      createdAt: card.createdAt,
      expiresAt: card.expiresAt,
      user: card.user
        ? {
            id: card.user.id,
            firstName: card.user.firstName,
            lastName: card.user.lastName,
          }
        : null,
    }));

    res.json({
      success: true,
      cards: sanitizedCards,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: any) {
    console.error("Bulletin board list error:", error);
    res.status(500).json({ error: "Failed to load bulletin board" });
  }
});

/**
 * GET /v1/bulletin-board/my/cards
 * List cards belonging to the authenticated user
 */
router.get("/my/cards", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const cardRepo = AppDataSource.getRepository(BulletinCard);
    const cards = await cardRepo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });

    res.json({
      success: true,
      cards: cards.map((c) => ({
        id: c.id,
        title: c.title,
        myPipedream: c.myPipedream,
        whatIHaveToOffer: c.whatIHaveToOffer,
        status: c.status,
        createdAt: c.createdAt,
        expiresAt: c.expiresAt,
      })),
    });
  } catch (error: any) {
    console.error("My bulletin cards error:", error);
    res.status(500).json({ error: "Failed to load your cards" });
  }
});

/**
 * GET /v1/bulletin-board/:id
 * Get a single bulletin card by ID
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const card = await AppDataSource.getRepository(BulletinCard).findOne({
      where: { id: req.params.id, status: BulletinCardStatus.ACTIVE, active: true },
      relations: ["user"],
    });

    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    res.json({
      success: true,
      card: {
        id: card.id,
        title: card.title,
        myPipedream: card.myPipedream,
        whatIHaveToOffer: card.whatIHaveToOffer,
        createdAt: card.createdAt,
        expiresAt: card.expiresAt,
        user: card.user
          ? {
              id: card.user.id,
              firstName: card.user.firstName,
              lastName: card.user.lastName,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error("Bulletin card fetch error:", error);
    res.status(500).json({ error: "Failed to load card" });
  }
});

/**
 * POST /v1/bulletin-board
 * Create a new bulletin card — requires auth + $1 Stripe charge
 * Body: { myPipedream, whatIHaveToOffer, title?, paymentMethodId }
 */
router.post("/", verifyToken, postCardLimiter, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { myPipedream, whatIHaveToOffer, title, paymentMethodId } = req.body;

    // Validation
    if (!myPipedream || !myPipedream.trim()) {
      return res.status(400).json({ error: '"My Pipedream" section is required' });
    }
    if (!whatIHaveToOffer || !whatIHaveToOffer.trim()) {
      return res.status(400).json({ error: '"What I Have to Offer" section is required' });
    }
    if (!paymentMethodId) {
      return res.status(400).json({ error: "Payment method is required" });
    }

    // Look up user for Stripe customer ID
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(400).json({ error: "User not found." });
    }

    // Check if posting fees are waived for this user
    const feeWaived = !!user.postingFeesWaived;

    let paymentIntent: Stripe.PaymentIntent | null = null;

    if (!feeWaived) {
      if (!user.stripeCustomerId) {
        return res.status(400).json({ error: "No payment method on file. Please update your account." });
      }

      // Charge $1.00 via Stripe
      try {
        paymentIntent = await stripe.paymentIntents.create({
          amount: 100, // $1.00 in cents
          currency: "usd",
          customer: user.stripeCustomerId,
          payment_method: paymentMethodId,
          confirm: true,
        description: "Bulletin Board card posting fee",
        metadata: {
          type: "bulletin_card",
          userId,
        },
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
      });
    } catch (stripeError: any) {
      console.error("Bulletin card payment failed:", stripeError);
      return res.status(402).json({
        error: "Payment failed",
        details: stripeError.message,
      });
    }
    } // end if (!feeWaived)

    // Create the card
    const cardRepo = AppDataSource.getRepository(BulletinCard);
    const card = cardRepo.create({
      userId,
      myPipedream: myPipedream.trim(),
      whatIHaveToOffer: whatIHaveToOffer.trim(),
      title: title?.trim() || null,
      stripePaymentIntentId: paymentIntent?.id || undefined,
      postingFee: feeWaived ? 0 : 1.0,
      status: feeWaived
        ? BulletinCardStatus.ACTIVE
        : (paymentIntent!.status === "succeeded"
          ? BulletinCardStatus.ACTIVE
          : BulletinCardStatus.PENDING_PAYMENT),
      active: feeWaived || paymentIntent!.status === "succeeded",
    });

    await cardRepo.save(card);

    // Create invoice for the bulletin card posting fee (skip if waived)
    if (!feeWaived && paymentIntent) {
      try {
        await invoiceService.createChargeInvoice({
          userId,
          type: InvoiceType.BULLETIN_FEE,
          amount: 1.0,
          stripePaymentIntentId: paymentIntent.id,
          description: "Bulletin Board card posting fee",
          lineItems: [{ description: "Bulletin card posting fee", quantity: 1, unitPrice: 1.0, total: 1.0 }],
          sourceEntityType: "bulletin_card",
          sourceEntityId: card.id,
          metadata: { cardTitle: card.title || "Untitled" },
        });
      } catch (invoiceErr: any) {
        console.warn("Invoice creation for bulletin card failed (non-fatal):", invoiceErr.message);
      }
    }

    res.status(201).json({
      success: true,
      card: {
        id: card.id,
        title: card.title,
        myPipedream: card.myPipedream,
        whatIHaveToOffer: card.whatIHaveToOffer,
        status: card.status,
        createdAt: card.createdAt,
      },
    });
  } catch (error: any) {
    console.error("Bulletin card creation error:", error);
    res.status(500).json({ error: "Failed to create bulletin card" });
  }
});

/**
 * PUT /v1/bulletin-board/:id
 * Edit own bulletin card (content only, no re-charge)
 * Body: { myPipedream?, whatIHaveToOffer?, title? }
 */
router.put("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const cardRepo = AppDataSource.getRepository(BulletinCard);
    const card = await cardRepo.findOne({
      where: { id: req.params.id },
    });

    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }
    if (card.userId !== userId) {
      return res.status(403).json({ error: "You can only edit your own cards" });
    }

    const { myPipedream, whatIHaveToOffer, title } = req.body;
    if (myPipedream !== undefined) card.myPipedream = myPipedream.trim();
    if (whatIHaveToOffer !== undefined) card.whatIHaveToOffer = whatIHaveToOffer.trim();
    if (title !== undefined) card.title = title?.trim() || null as any;

    await cardRepo.save(card);

    res.json({
      success: true,
      card: {
        id: card.id,
        title: card.title,
        myPipedream: card.myPipedream,
        whatIHaveToOffer: card.whatIHaveToOffer,
        updatedAt: card.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Bulletin card update error:", error);
    res.status(500).json({ error: "Failed to update card" });
  }
});

/**
 * DELETE /v1/bulletin-board/:id
 * Delete own card (or admin can delete any)
 */
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const cardRepo = AppDataSource.getRepository(BulletinCard);
    const card = await cardRepo.findOne({
      where: { id: req.params.id },
    });

    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    // Check ownership or admin role
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });
    const isAdmin = user?.role === "admin" || user?.isStaff;
    if (card.userId !== userId && !isAdmin) {
      return res.status(403).json({ error: "Not authorized to delete this card" });
    }

    card.status = BulletinCardStatus.REMOVED;
    card.active = false;
    await cardRepo.save(card);

    res.json({ success: true, message: "Card removed" });
  } catch (error: any) {
    console.error("Bulletin card delete error:", error);
    res.status(500).json({ error: "Failed to delete card" });
  }
});

export default router;
