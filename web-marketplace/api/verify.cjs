#!/usr/bin/env node
/**
 * PDS Marketplace - Quick Verification Test
 * Validates project structure and build
 */

const fs = require("fs");
const path = require("path");

console.log("🧪 PDS Marketplace - Quick Verification\n");

// Test 1: Check if all required files exist
console.log("Test 1: File Structure");
const requiredFiles = [
  "dist/index.js",
  "dist/database.js",
  "dist/entities/user.js",
  "dist/entities/seller.js",
  "dist/entities/manufacturer.js",
  "dist/entities/product.js",
  "dist/entities/order.js",
  "dist/entities/order-item.js",
  "dist/entities/bid.js",
  "dist/services/geolocation.js",
  "dist/migrations/1707676401234-CreateInitialSchema.js",
  "package.json",
  ".env",
];

let filesOk = true;
for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ✗ ${file} - MISSING`);
    filesOk = false;
  }
}

// Test 2: Check package.json
console.log("\nTest 2: Dependencies");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
const requiredDeps = [
  "express",
  "dotenv",
  "cors",
  "typeorm",
  "pg",
  "stripe",
  "bcrypt",
  "jsonwebtoken",
];

let depsOk = true;
for (const dep of requiredDeps) {
  if (packageJson.dependencies[dep]) {
    console.log(`  ✓ ${dep} (${packageJson.dependencies[dep]})`);
  } else {
    console.log(`  ✗ ${dep} - NOT FOUND`);
    depsOk = false;
  }
}

// Test 3: Check environment configuration
console.log("\nTest 3: Environment Configuration");
const envContent = fs.readFileSync(".env", "utf-8");
const requiredEnvVars = [
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "POSTGRES_DB",
  "NODE_ENV",
  "PORT",
  "JWT_SECRET",
];

let envOk = true;
for (const envVar of requiredEnvVars) {
  if (envContent.includes(envVar)) {
    console.log(`  ✓ ${envVar} configured`);
  } else {
    console.log(`  ✗ ${envVar} - NOT CONFIGURED`);
    envOk = false;
  }
}

// Test 4: Check database build
console.log("\nTest 4: Database Configuration");
const databaseJs = fs.readFileSync("dist/database.js", "utf-8");
const dbChecks = [
  ["PostgreSQL type", 'type.*"postgres"'],
  ["Entity list", "entities:"],
  ["Synchronize option", "synchronize"],
  ["Logging enabled", "logging"],
];

let dbOk = true;
for (const [check, pattern] of dbChecks) {
  if (new RegExp(pattern, "i").test(databaseJs)) {
    console.log(`  ✓ ${check}`);
  } else {
    console.log(`  ✗ ${check} - NOT FOUND`);
    dbOk = false;
  }
}

// Test 5: API server check
console.log("\nTest 5: API Server");
const indexJs = fs.readFileSync("dist/index.js", "utf-8");
const apiChecks = [
  ["Health endpoint", "/health"],
  ["API version endpoint", "/v1/api/version"],
  ["Marketplace sellers", "/v1/marketplace/sellers"],
  ["Marketplace manufacturers", "/v1/marketplace/manufacturers"],
  ["Database initialization", "AppDataSource"],
  ["Error handling", "catch"],
];

let apiOk = true;
for (const [check, pattern] of apiChecks) {
  if (indexJs.includes(pattern)) {
    console.log(`  ✓ ${check}`);
  } else {
    console.log(`  ✗ ${check} - NOT FOUND`);
    apiOk = false;
  }
}

// Test 6: Geolocation service
console.log("\nTest 6: Geolocation Service");
const geoJs = fs.readFileSync("dist/services/geolocation.js", "utf-8");
const geoChecks = [
  ["Distance calculation", "calculateDistance"],
  ["Haversine formula", "degreesToRadians"],
  ["Radius search", "findSellersByRadius"],
  ["State filtering", "findSellersByState"],
  ["Location validation", "validateLocation"],
];

let geoOk = true;
for (const [check, pattern] of geoChecks) {
  if (geoJs.includes(pattern)) {
    console.log(`  ✓ ${check}`);
  } else {
    console.log(`  ✗ ${check} - NOT FOUND`);
    geoOk = false;
  }
}

// Summary
console.log("\n" + "=".repeat(50));
console.log("Test Results:");
console.log(
  filesOk ? "  ✓ File structure" : "  ✗ File structure"
);
console.log(depsOk ? "  ✓ Dependencies" : "  ✗ Dependencies");
console.log(envOk ? "  ✓ Environment" : "  ✗ Environment");
console.log(dbOk ? "  ✓ Database config" : "  ✗ Database config");
console.log(apiOk ? "  ✓ API server" : "  ✗ API server");
console.log(geoOk ? "  ✓ Geolocation" : "  ✗ Geolocation");

const allOk = filesOk && depsOk && envOk && dbOk && apiOk && geoOk;
console.log("\n" + "=".repeat(50));
if (allOk) {
  console.log("✅ ALL TESTS PASSED!\n");
  console.log("Your application is ready to run:");
  console.log("  1. Ensure PostgreSQL is running");
  console.log("  2. Run: npm start");
  console.log("  3. Visit: http://localhost:3000/health\n");
} else {
  console.log("⚠️ Some tests failed. Please review the output above.\n");
}

process.exit(allOk ? 0 :1);
