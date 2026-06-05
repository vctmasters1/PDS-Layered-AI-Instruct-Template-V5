#!/usr/bin/env node
/**
 * PDS Marketplace - Simple CSS/JS Build Script
 * 
 * Concatenates CSS partials and JS files into single bundles
 * to eliminate the HTTP waterfall (22 CSS @import + 12 script tags).
 * 
 * Usage: node build.js
 * Output: dist/styles.bundle.css, dist/app.bundle.js
 */

const fs = require("fs");
const path = require("path");

const FRONTEND_DIR = __dirname;
const DIST_DIR = path.join(FRONTEND_DIR, "dist");

// CSS partials in dependency order (matches @import order in styles.css)
const CSS_PARTIALS = [
  "css/_variables.css",
  "css/_buttons.css",
  "css/_layout.css",
  "css/_navbar.css",
  "css/_mission.css",
  "css/_account.css",
  "css/_cards-product.css",
  "css/_cards-designer.css",
  "css/_cards-producer.css",
  "css/_availability.css",
  "css/_dashboard.css",
  "css/_map.css",
  "css/_modals.css",
  "css/_cart.css",
  "css/_messaging.css",
  "css/_custom-projects.css",
  "css/_search.css",
  "css/_admin.css",
  "css/_footer.css",
  "css/_tablet.css",
  "css/_phone.css",
];

// JS files in dependency order (matches <script> tag order in index.html)
const JS_FILES = [
  "js/data.js",
  "js/utils.js",
  "js/search.js",
  "js/render.js",
  "js/ui.js",
  "js/cart.js",
  "js/products.js",
  "js/producer-queue.js",
  "js/messaging.js",
  "js/notifications.js",
  "js/admin.js",
  "app.js",
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function bundleFiles(files, outputPath, label) {
  let bundle = `/* ${label} - Generated ${new Date().toISOString()} */\n\n`;
  let totalSize = 0;

  for (const file of files) {
    const filePath = path.join(FRONTEND_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠ Missing: ${file}`);
      continue;
    }
    let content = fs.readFileSync(filePath, "utf8");
    // Strip CSS @import url() directives (they're inlined now)
    if (file.endsWith(".css")) {
      content = content.replace(/@import\s+url\([^)]+\);\s*/g, "");
    }
    bundle += `/* === ${file} === */\n${content}\n\n`;
    totalSize += content.length;
  }

  fs.writeFileSync(outputPath, bundle, "utf8");
  const bundleSize = (Buffer.byteLength(bundle) / 1024).toFixed(1);
  console.log(`  ✓ ${label}: ${files.length} files → ${bundleSize} KB`);
}

// Also read styles.css preamble (base styles before @imports)
function bundleCSS() {
  const stylesPath = path.join(FRONTEND_DIR, "styles.css");
  let preamble = "";
  if (fs.existsSync(stylesPath)) {
    const raw = fs.readFileSync(stylesPath, "utf8");
    // Get content before the first @import (base styles, :root, etc.)
    const firstImport = raw.indexOf("@import");
    if (firstImport > 0) {
      preamble = raw.substring(0, firstImport);
    }
    // Get content after the last @import (any trailing base styles)
    const lastImportEnd = raw.lastIndexOf(";", raw.lastIndexOf("@import")) + 1;
    const afterImports = raw.substring(lastImportEnd).trim();
    if (afterImports) {
      preamble += "\n" + afterImports;
    }
  }

  const outputPath = path.join(DIST_DIR, "styles.bundle.css");
  let bundle = `/* PDS Marketplace CSS Bundle - Generated ${new Date().toISOString()} */\n\n`;
  
  if (preamble.trim()) {
    bundle += `/* === styles.css (base) === */\n${preamble}\n\n`;
  }

  for (const file of CSS_PARTIALS) {
    const filePath = path.join(FRONTEND_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠ Missing: ${file}`);
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    bundle += `/* === ${file} === */\n${content}\n\n`;
  }

  fs.writeFileSync(outputPath, bundle, "utf8");
  const bundleSize = (Buffer.byteLength(bundle) / 1024).toFixed(1);
  console.log(`  ✓ CSS Bundle: ${CSS_PARTIALS.length + 1} files → ${bundleSize} KB`);
}

// Main
console.log("PDS Marketplace Build");
console.log("=====================");
ensureDir(DIST_DIR);
bundleCSS();
bundleFiles(JS_FILES, path.join(DIST_DIR, "app.bundle.js"), "JS Bundle");
console.log("\nDone! To use bundles, update index.html to reference dist/ files.");
console.log("Tip: In production, replace <link> and <script> tags with bundled versions.");
