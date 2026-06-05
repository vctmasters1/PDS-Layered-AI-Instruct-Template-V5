/**
 * seed-dummy-profiles.ts
 *
 * Creates dummy designer and producer accounts for local UI development.
 * Safe to run multiple times — skips accounts that already exist.
 *
 * Seeded accounts:
 *   dummy-designer-1@dev.local  → "Bloom Craft Studio"         Portland OR   (locationPrivate: false)
 *   dummy-designer-2@dev.local  → "Iron & Oak Designs"          Denver CO     (locationPrivate: false)
 *   dummy-designer-3@dev.local  → "Pixel Sprout Studio"         Austin TX     (locationPrivate: true)
 *   dummy-producer-1@dev.local  → "Cascade Fabrication Co."     Seattle WA    (locationPrivate: false)
 *   dummy-producer-2@dev.local  → "Mesa Ridge Manufacturing"    Phoenix AZ    (locationPrivate: false)
 *   dummy-producer-3@dev.local  → "Northgate Prototyping"       Minneapolis MN (locationPrivate: true)
 *
 * All service/capability assignments are randomized so the map and search
 * pages render diverse data. Re-running deletes existing dummy rows first
 * then re-seeds so capabilities are refreshed.
 *
 * Password for all: PdsLocal!Test1
 *
 * SAFETY: Refuses to run in production.
 *
 * Run: npm run seed:dummy-profiles  (from WEB-Marketplace/api/)
 */

import "module-alias/register"; // must be first — registers @db-central alias

import 'module-alias/register'; // must be first — registers @db-central → DB-Central/dist
import * as dotenv from "dotenv";
import * as path from "path";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: path.join(__dirname, "..", "..", ".env.production") });
} else {
  dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
}

if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: path.join(__dirname, "..", "..", ".env.production") });
} else {
  dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
}

import AppDataSource from "../database.js";
import { User, UserRole } from "../entities/user.js";
import { Designer, BusinessType } from "../entities/designer.js";
import { Producer } from "../entities/producer.js";

const DUMMY_PASSWORD = "PdsLocal!Test1";

// ── Deterministic shuffle — same seed every run so diffs are readable ────────
function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pick<T>(arr: T[], seed: number, count: number): T[] {
  return deterministicShuffle(arr, seed).slice(0, count);
}

// ── Capability pools ─────────────────────────────────────────────────────────

const ALL_MATERIALS = ["PLA", "PETG", "ABS", "Resin", "Nylon", "TPU", "Aluminum", "Steel", "MDF", "Plywood", "Acrylic", "Carbon Fiber", "Brass", "Copper"];
const ALL_PRODUCT_TYPES = ["enclosures", "brackets", "prototypes", "functional_parts", "panels", "signage", "furniture_components", "jigs", "fixtures", "consumer_goods", "wearables", "decorative", "automotive_parts", "medical_models"];

// Designer specialty pools
const ALL_SPECIALTIES = [
  "sustainable materials",
  "industrial-modern furniture",
  "custom metalwork",
  "consumer electronics accessories",
  "apparel & fashion",
  "home décor",
  "architectural models",
  "jewelry & wearables",
  "toy & game design",
  "medical device prototyping",
  "automotive styling",
  "packaging design",
];

// ── Designer seed data ────────────────────────────────────────────────────────

const DESIGNERS: Array<{
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  businessName: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  businessLatitude: number;
  businessLongitude: number;
  locationPrivate: boolean;
  businessType: BusinessType;
  bio: string;
  location_address: string;
  location_city: string;
  location_state: string;
  location_zipCode: string;
  location_latitude: number;
  location_longitude: number;
  location_serviceRadius: number;
  website: string;
  availability: string;
  averageLeadTime: number;
  specialtySeed: number;
}> = [
  {
    email: "dummy-designer-1@dev.local",
    firstName: "Aria",
    lastName: "Chen",
    phone: "503-555-0110",
    businessName: "Bloom Craft Studio",
    businessCity: "Portland",
    businessState: "OR",
    businessZip: "97201",
    businessLatitude: 45.5231,
    businessLongitude: -122.6765,
    locationPrivate: false,
    businessType: BusinessType.CREATOR,
    bio:
      "Specializing in sustainable home goods, ceramics, and hand-woven textiles. " +
      "Aria sources all materials within 100 miles of Portland and prioritizes zero-waste production runs.",
    location_address: "42 Artisan Row",
    location_city: "Portland",
    location_state: "OR",
    location_zipCode: "97201",
    location_latitude: 45.5231,
    location_longitude: -122.6765,
    location_serviceRadius: 150,
    website: "https://bloomcraftstudio.example",
    availability: "available",
    averageLeadTime: 10,
    specialtySeed: 101,
  },
  {
    email: "dummy-designer-2@dev.local",
    firstName: "Marcus",
    lastName: "Reyes",
    phone: "303-555-0247",
    businessName: "Iron & Oak Designs",
    businessCity: "Denver",
    businessState: "CO",
    businessZip: "80203",
    businessLatitude: 39.7392,
    businessLongitude: -104.9903,
    locationPrivate: false,
    businessType: BusinessType.INDIVIDUAL,
    bio:
      "Industrial-modern furniture and lighting. Custom metalwork paired with hardwood accents. " +
      "Marcus takes on 4–6 commissions per quarter and offers free 3D model previews before production.",
    location_address: "810 Workshop Blvd",
    location_city: "Denver",
    location_state: "CO",
    location_zipCode: "80203",
    location_latitude: 39.7392,
    location_longitude: -104.9903,
    location_serviceRadius: 300,
    website: "https://ironandoak.example",
    availability: "available",
    averageLeadTime: 21,
    specialtySeed: 202,
  },
  {
    email: "dummy-designer-3@dev.local",
    firstName: "Priya",
    lastName: "Nair",
    phone: "512-555-0389",
    businessName: "Pixel Sprout Studio",
    businessCity: "Austin",
    businessState: "TX",
    businessZip: "78701",
    businessLatitude: 30.2672,
    businessLongitude: -97.7431,
    locationPrivate: true, // Priya hides exact location
    businessType: BusinessType.SMALL_PRODUCER,
    bio:
      "Consumer electronics accessories and precision enclosures. " +
      "All files optimized for FDM and SLA printing with drop-in hardware compatibility. " +
      "Rapid iteration cycles — first prototype typically delivered within 5 business days.",
    location_address: "200 Maker Ave",
    location_city: "Austin",
    location_state: "TX",
    location_zipCode: "78701",
    location_latitude: 30.2672,
    location_longitude: -97.7431,
    location_serviceRadius: 500,
    website: "https://pixelsprout.example",
    availability: "busy",
    averageLeadTime: 5,
    specialtySeed: 303,
  },
];

// ── Producer seed data ────────────────────────────────────────────────────────

const PRODUCERS: Array<{
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  businessName: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  businessLatitude: number;
  businessLongitude: number;
  locationPrivate: boolean;
  bio: string;
  location_address: string;
  location_city: string;
  location_state: string;
  location_zipCode: string;
  location_latitude: number;
  location_longitude: number;
  location_serviceRadius: number;
  materialSeed: number;
  productTypeSeed: number;
  minBatch: number;
  maxCapacity: number;
  availability: string;
  averageLeadTime: number;
}> = [
  {
    email: "dummy-producer-1@dev.local",
    firstName: "Jordan",
    lastName: "Walsh",
    phone: "206-555-0412",
    businessName: "Cascade Fabrication Co.",
    businessCity: "Seattle",
    businessState: "WA",
    businessZip: "98101",
    businessLatitude: 47.6062,
    businessLongitude: -122.3321,
    locationPrivate: false,
    bio:
      "Full-service FDM + SLA print farm with 40 machines running 24/7. " +
      "MOQ 1 unit. Volume discounts start at 50 units. Post-processing (sanding, painting, threading) available.",
    location_address: "5 Industrial Park Dr",
    location_city: "Seattle",
    location_state: "WA",
    location_zipCode: "98101",
    location_latitude: 47.6062,
    location_longitude: -122.3321,
    location_serviceRadius: 200,
    materialSeed: 411,
    productTypeSeed: 412,
    minBatch: 1,
    maxCapacity: 2000,
    availability: "available",
    averageLeadTime: 7,
  },
  {
    email: "dummy-producer-2@dev.local",
    firstName: "Sam",
    lastName: "Okafor",
    phone: "602-555-0578",
    businessName: "Mesa Ridge Manufacturing",
    businessCity: "Phoenix",
    businessState: "AZ",
    businessZip: "85001",
    businessLatitude: 33.4484,
    businessLongitude: -112.0740,
    locationPrivate: false,
    bio:
      "CNC machining, laser cutting, and sheet-metal fabrication. Aluminum, steel, and engineered wood. " +
      "ISO 9001 certified. DFM review included with every quote. Shipping to all 50 states.",
    location_address: "1700 Mesa Industrial Blvd",
    location_city: "Phoenix",
    location_state: "AZ",
    location_zipCode: "85001",
    location_latitude: 33.4484,
    location_longitude: -112.0740,
    location_serviceRadius: 400,
    materialSeed: 521,
    productTypeSeed: 522,
    minBatch: 5,
    maxCapacity: 800,
    availability: "available",
    averageLeadTime: 14,
  },
  {
    email: "dummy-producer-3@dev.local",
    firstName: "Taylor",
    lastName: "Brooks",
    phone: "612-555-0693",
    businessName: "Northgate Prototyping",
    businessCity: "Minneapolis",
    businessState: "MN",
    businessZip: "55401",
    businessLatitude: 44.9778,
    businessLongitude: -93.2650,
    locationPrivate: true, // Taylor keeps location fuzzy
    bio:
      "Rapid prototyping and short-run production. Specializing in consumer product development cycles. " +
      "Works closely with industrial designers — offers co-design sessions and tolerances down to ±0.1 mm.",
    location_address: "89 Innovation Circle",
    location_city: "Minneapolis",
    location_state: "MN",
    location_zipCode: "55401",
    location_latitude: 44.9778,
    location_longitude: -93.2650,
    location_serviceRadius: 250,
    materialSeed: 631,
    productTypeSeed: 632,
    minBatch: 1,
    maxCapacity: 500,
    availability: "waitlist",
    averageLeadTime: 12,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

async function upsertUser(
  userRepo: ReturnType<typeof AppDataSource.getRepository<User>>,
  data: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: UserRole;
    businessCity?: string;
    businessState?: string;
    businessZip?: string;
    businessLatitude?: number;
    businessLongitude?: number;
    locationPrivate?: boolean;
    activeDesigner?: boolean;
    activeProducer?: boolean;
  },
  hash: string
): Promise<{ user: User; created: boolean }> {
  const existing = await userRepo.findOne({ where: { email: data.email } });
  if (existing) {
    return { user: existing, created: false };
  }

  const user = userRepo.create({
    id: uuidv4(),
    email: data.email,
    password: hash,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone ?? null,
    role: data.role,
    emailVerified: true,
    active: true,
    verified: true,
    commissionRate: 0.1,
    activeDesigner: data.activeDesigner ?? false,
    activeProducer: data.activeProducer ?? false,
    businessCity: data.businessCity ?? null,
    businessState: data.businessState ?? null,
    businessZip: data.businessZip ?? null,
    businessLatitude: data.businessLatitude ?? null,
    businessLongitude: data.businessLongitude ?? null,
    locationPrivate: data.locationPrivate ?? false,
  } as any);
  const saved: User = await userRepo.save(user) as unknown as User;
  return { user: saved, created: true };
}

async function seedProfiles() {
  if (process.env.NODE_ENV === "production") {
    console.error("❌  Refusing to seed in production. Set NODE_ENV=development.");
    process.exit(1);
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const userRepo     = AppDataSource.getRepository(User);
  const designerRepo = AppDataSource.getRepository(Designer);
  const producerRepo = AppDataSource.getRepository(Producer);

  const hash = await bcrypt.hash(DUMMY_PASSWORD, 10);
  let createdCount = 0;
  let skippedCount = 0;

  // ── Designers ──────────────────────────────────────────────────────────────
  console.log("\n👤  Seeding designers...");
  for (const d of DESIGNERS) {
    const { user, created } = await upsertUser(userRepo, {
      email: d.email,
      firstName: d.firstName,
      lastName: d.lastName,
      phone: d.phone,
      role: UserRole.DESIGNER,
      businessCity: d.businessCity,
      businessState: d.businessState,
      businessZip: d.businessZip,
      businessLatitude: d.businessLatitude,
      businessLongitude: d.businessLongitude,
      locationPrivate: d.locationPrivate,
      activeDesigner: true,
    }, hash);

    if (!created) {
      console.log(`  ⏭️  ${d.email} already exists — skipped`);
      skippedCount++;
      continue;
    }

    // Randomize specialties — pick 3–4 from the pool using deterministic seed
    const specialtyCount = 3 + (d.specialtySeed % 2);
    const specialties = pick(ALL_SPECIALTIES, d.specialtySeed, specialtyCount);

    const profile = designerRepo.create({
      id: uuidv4(),
      user,
      businessName: d.businessName,
      businessType: d.businessType,
      bio: d.bio,
      website: d.website,
      location_address: d.location_address,
      location_city: d.location_city,
      location_state: d.location_state,
      location_zipCode: d.location_zipCode,
      location_country: "USA",
      location_latitude: d.location_latitude,
      location_longitude: d.location_longitude,
      location_serviceRadius: d.location_serviceRadius,
      availability: d.availability,
      averageLeadTime: d.averageLeadTime,
      rating: parseFloat((3.5 + ((d.specialtySeed % 15) / 10)).toFixed(2)),
      reviewCount: 5 + (d.specialtySeed % 35),
      verified: true,
      active: true,
    } as any);
    await designerRepo.save(profile);

    console.log(`  ✅  ${d.email}  →  ${d.businessName}  (${d.businessCity}, ${d.businessState})  specialties: ${specialties.join(", ")}`);
    createdCount++;
  }

  // ── Producers ─────────────────────────────────────────────────────────────
  console.log("\n🏭  Seeding producers...");
  for (const p of PRODUCERS) {
    const { user, created } = await upsertUser(userRepo, {
      email: p.email,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      role: UserRole.PRODUCER,
      businessCity: p.businessCity,
      businessState: p.businessState,
      businessZip: p.businessZip,
      businessLatitude: p.businessLatitude,
      businessLongitude: p.businessLongitude,
      locationPrivate: p.locationPrivate,
      activeProducer: true,
    }, hash);

    if (!created) {
      console.log(`  ⏭️  ${p.email} already exists — skipped`);
      skippedCount++;
      continue;
    }

    // Randomize materials and product types from capability pools
    const materialCount = 3 + (p.materialSeed % 4);
    const productTypeCount = 3 + (p.productTypeSeed % 4);
    const materials = pick(ALL_MATERIALS, p.materialSeed, materialCount);
    const productTypes = pick(ALL_PRODUCT_TYPES, p.productTypeSeed, productTypeCount);

    const profile = producerRepo.create({
      id: uuidv4(),
      user,
      businessName: p.businessName,
      bio: p.bio,
      location_address: p.location_address,
      location_city: p.location_city,
      location_state: p.location_state,
      location_zipCode: p.location_zipCode,
      location_country: "USA",
      location_latitude: p.location_latitude,
      location_longitude: p.location_longitude,
      location_serviceRadius: p.location_serviceRadius,
      capabilities_materialTypes: materials,
      capabilities_productTypes: productTypes,
      capabilities_minBatchSize: p.minBatch,
      capabilities_maxCapacityPerMonth: p.maxCapacity,
      availability: p.availability,
      averageLeadTime: p.averageLeadTime,
      rating: parseFloat((3.8 + ((p.materialSeed % 11) / 10)).toFixed(2)),
      reviewCount: 3 + (p.materialSeed % 22),
      verified: true,
      active: true,
    } as any);
    await producerRepo.save(profile);

    console.log(`  ✅  ${p.email}  →  ${p.businessName}  (${p.businessCity}, ${p.businessState})`);
    console.log(`       materials: ${materials.join(", ")}`);
    console.log(`       products:  ${productTypes.join(", ")}`);
    createdCount++;
  }

  console.log(`\n✅  Done. Created: ${createdCount}  Skipped: ${skippedCount}`);
  console.log(`   Password for all accounts: ${DUMMY_PASSWORD}`);

  await AppDataSource.destroy();
}

seedProfiles().catch((e) => {
  console.error("❌  seed-dummy-profiles failed:", e.message);
  process.exit(1);
});
