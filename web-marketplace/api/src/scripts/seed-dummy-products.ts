/**
 * seed-dummy-products.ts
 *
 * Creates dummy products under the dummy designer accounts for local UI development.
 * Safe to run multiple times — skips products whose SKU already exists.
 *
 * Requires seed-dummy-profiles to have been run first so dummy-designer-* accounts exist.
 *
 * SAFETY: Refuses to run in production.
 *
 * Run: npm run seed:dummy-products  (from WEB-Marketplace/api/)
 */

import 'module-alias/register'; // must be first — registers @db-central → DB-Central/dist
import * as dotenv from "dotenv";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: path.join(__dirname, "..", "..", ".env.production") });
} else {
  dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
}

import AppDataSource from "../database.js";
import { User } from "../entities/user.js";
import { Product, FulfillmentType } from "../entities/product.js";

// ── Product seed data ─────────────────────────────────────────────────────────
// Keyed by designer email. SKUs must be globally unique.

const PRODUCTS_BY_DESIGNER: Record<string, Array<{
  name: string;
  description: string;
  sku: string;
  price: number;
  category: string;
  leadTime: number;
  fulfilledBy: FulfillmentType;
  manufacturingRequirements?: string;
  productWidth?: number;
  productHeight?: number;
  productDepth?: number;
  productWeight?: number;
  stock: number;
}>> = {
  "dummy-designer-1@dev.local": [
    {
      name: "Speckled Stoneware Mug",
      description: "Hand-thrown stoneware mug with a natural speckled glaze. Dishwasher safe. Holds 12 oz.",
      sku: "BLOOM-MUG-001",
      price: 38.00,
      category: "Kitchen & Dining",
      leadTime: 10,
      fulfilledBy: FulfillmentType.SELF,
      productWidth: 4.5,
      productHeight: 4.0,
      productDepth: 4.5,
      productWeight: 0.75,
      stock: 24,
    },
    {
      name: "Woven Cotton Throw",
      description: "Hand-woven 100% organic cotton throw. 50x60 inches. Available in natural cream and sage.",
      sku: "BLOOM-THROW-001",
      price: 118.00,
      category: "Home Textiles",
      leadTime: 14,
      fulfilledBy: FulfillmentType.SELF,
      productWidth: 60.0,
      productHeight: 50.0,
      productDepth: 2.0,
      productWeight: 1.8,
      stock: 10,
    },
    {
      name: "Succulent Planter Set",
      description: "Set of 3 graduated ceramic planters with drainage holes. Includes saucers. Matte terracotta finish.",
      sku: "BLOOM-PLANT-003",
      price: 72.00,
      category: "Garden & Outdoors",
      leadTime: 7,
      fulfilledBy: FulfillmentType.SELF,
      productWidth: 6.0,
      productHeight: 5.0,
      productDepth: 6.0,
      productWeight: 1.2,
      stock: 18,
    },
  ],

  "dummy-designer-2@dev.local": [
    {
      name: "Industrial Pipe Desk Lamp",
      description: "Adjustable desk lamp with black iron pipe fittings and Edison-style bulb. Powder-coated steel base.",
      sku: "IRONOAK-LAMP-001",
      price: 145.00,
      category: "Lighting",
      leadTime: 21,
      fulfilledBy: FulfillmentType.PRODUCER,
      manufacturingRequirements: "Steel pipe fittings 1/2in NPT. Black powder coat. Cord: braided cloth, 72in, inline dimmer switch.",
      productWidth: 8.0,
      productHeight: 18.0,
      productDepth: 8.0,
      productWeight: 3.5,
      stock: 0,
    },
    {
      name: "Walnut & Steel Coffee Table",
      description: "Live-edge walnut slab with hand-forged steel legs. Each piece is unique. 48x24 in. Shown in natural oil finish.",
      sku: "IRONOAK-TABLE-002",
      price: 895.00,
      category: "Furniture",
      leadTime: 42,
      fulfilledBy: FulfillmentType.PRODUCER,
      manufacturingRequirements: "Walnut slab min 2in thick, bookmatched preferred. Hairpin legs 18in, 3/8in rod, raw steel or black powder coat.",
      productWidth: 48.0,
      productHeight: 18.0,
      productDepth: 24.0,
      productWeight: 55.0,
      stock: 0,
    },
    {
      name: "Floating Wall Shelf — Oak",
      description: "Solid white oak floating shelf with hidden bracket system. Ships in 24-inch segment. Custom widths available.",
      sku: "IRONOAK-SHELF-001",
      price: 88.00,
      category: "Storage & Organization",
      leadTime: 18,
      fulfilledBy: FulfillmentType.SELF,
      productWidth: 24.0,
      productHeight: 2.0,
      productDepth: 8.0,
      productWeight: 5.0,
      stock: 8,
    },
  ],

  "dummy-designer-3@dev.local": [
    {
      name: "Raspberry Pi 4 Enclosure",
      description: "Low-profile vented enclosure for Raspberry Pi 4 Model B. No tools required. Snap-fit lid with rubber feet.",
      sku: "PIXEL-RPI4-001",
      price: 18.00,
      category: "Electronics Accessories",
      leadTime: 5,
      fulfilledBy: FulfillmentType.PRODUCER,
      manufacturingRequirements: "FDM print PLA+. Layer height 0.2mm. 15% infill. Supports required for GPIO opening.",
      productWidth: 3.7,
      productHeight: 1.3,
      productDepth: 2.7,
      productWeight: 0.12,
      stock: 0,
    },
    {
      name: "Magnetic Cable Organizer Clip",
      description: "Desk-mount cable clip with neodymium magnet insert. Fits cables 3–8mm diameter. Set of 6.",
      sku: "PIXEL-CABLE-002",
      price: 14.00,
      category: "Electronics Accessories",
      leadTime: 4,
      fulfilledBy: FulfillmentType.PRODUCER,
      manufacturingRequirements: "FDM print PETG. 30% infill. Neodymium disc magnet 10x2mm press-fit (not included in print file).",
      productWidth: 1.5,
      productHeight: 1.0,
      productDepth: 1.5,
      productWeight: 0.04,
      stock: 0,
    },
    {
      name: "USB-C Hub Desk Dock",
      description: "7-port USB-C hub with angled display stand. Fits any USB-C hub body 90x45x15mm. Clean cable routing underneath.",
      sku: "PIXEL-DOCK-003",
      price: 32.00,
      category: "Electronics Accessories",
      leadTime: 6,
      fulfilledBy: FulfillmentType.PRODUCER,
      manufacturingRequirements: "SLA print resin, clear or grey. 0.05mm layer height. Sand and finish smooth before shipping.",
      productWidth: 5.5,
      productHeight: 3.5,
      productDepth: 3.0,
      productWeight: 0.28,
      stock: 0,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

async function seedProducts() {
  if (process.env.NODE_ENV === "production") {
    console.error("❌  Refusing to seed in production. Set NODE_ENV=development.");
    process.exit(1);
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const userRepo    = AppDataSource.getRepository(User);
  const productRepo = AppDataSource.getRepository(Product);

  let created = 0;
  let skipped = 0;

  for (const [designerEmail, products] of Object.entries(PRODUCTS_BY_DESIGNER)) {
    const designer = await userRepo.findOne({ where: { email: designerEmail } });
    if (!designer) {
      console.warn(`⚠️  Designer not found: ${designerEmail} — run seed:dummy-profiles first`);
      continue;
    }

    console.log(`\n📦  ${designerEmail}  (id: ${designer.id})`);

    for (const p of products) {
      const existing = await productRepo.findOne({ where: { sku: p.sku } });
      if (existing) {
        console.log(`  ⏭️  SKU ${p.sku} already exists — skipped`);
        skipped++;
        continue;
      }

      const product = productRepo.create({
        id: uuidv4(),
        designer,
        designerId: designer.id,
        name: p.name,
        description: p.description,
        sku: p.sku,
        price: p.price,
        category: p.category,
        leadTime: p.leadTime,
        fulfilledBy: p.fulfilledBy,
        manufacturingRequirements: p.manufacturingRequirements,
        productWidth: p.productWidth,
        productHeight: p.productHeight,
        productDepth: p.productDepth,
        productWeight: p.productWeight,
        active: true,
        stock: p.stock,
      });
      await productRepo.save(product);

      console.log(`  ✅  ${p.sku}  "${p.name}"  $${p.price}`);
      created++;
    }
  }

  console.log(`\n✅  Done. Created: ${created}  Skipped: ${skipped}`);

  await AppDataSource.destroy();
}

seedProducts().catch((e) => {
  console.error("❌  seed-dummy-products failed:", e.message);
  process.exit(1);
});
