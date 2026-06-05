/**
 * Seed script: Clear dummy data and create admin user
 * Run with: npx ts-node --esm src/scripts/seed-admin.ts
 * Or after build: node dist/scripts/seed-admin.js
 */
import * as dotenv from "dotenv";
import * as path from "path";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

// Load env
if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: path.join(__dirname, "..", "..", ".env.production") });
} else {
  dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
}

import AppDataSource from "../database.js";
import { User, UserRole } from "../entities/user.js";

async function seedAdmin() {
  try {
    console.log("🔌 Connecting to database...");
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    console.log("✅ Connected");

    const userRepo = AppDataSource.getRepository(User);

    // Clear all non-admin users (dummy data cleanup)
    const existingUsers = await userRepo.find();
    console.log(`📊 Found ${existingUsers.length} existing users`);

    if (existingUsers.length > 0) {
      // Delete all users first (cascade will handle related records)
      console.log("🗑️  Clearing all existing users...");
      await userRepo.createQueryBuilder()
        .delete()
        .from(User)
        .execute();
      console.log("✅ All users cleared");
    }

    // Create admin user
    const adminEmail = "vctmasters@gmail.com";
    const adminPassword = "__PipeDreamAdmin!";
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const admin = userRepo.create({
      id: uuidv4(),
      email: adminEmail,
      password: hashedPassword,
      firstName: "Admin",
      lastName: "PipeDream",
      role: UserRole.ADMIN,
      isStaff: true,
      staffRole: "super_admin",
      emailVerified: true,
      active: true,
      verified: true,
      commissionRate: 0,
    });

    await userRepo.save(admin);
    console.log(`✅ Admin user created: ${adminEmail}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   ID: ${admin.id}`);

    // Also clear other tables with dummy data
    const queryRunner = AppDataSource.createQueryRunner();
    const tables = [
      "order_items",
      "payment_milestones",
      "disputes",
      "bids",
      "orders",
      "products",
      "services",
      "designers",
      "producers",
      "messages",
      "notifications",
      "notification_preferences",
      "favorites",
      "saved_searches",
    ];

    for (const table of tables) {
      try {
        await queryRunner.query(`DELETE FROM "${table}"`);
        console.log(`🗑️  Cleared table: ${table}`);
      } catch (e: any) {
        // Table might not exist yet
        console.log(`⚠️  Skipped table: ${table} (${e.message?.split("\n")[0]})`);
      }
    }

    await queryRunner.release();

    console.log("\n🎉 Database seeded successfully!");
    console.log(`\nAdmin login credentials:`);
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seedAdmin();
