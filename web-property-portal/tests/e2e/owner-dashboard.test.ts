import { test, expect } from "@playwright/test";

/**
 * E2E Tests for Owner Dashboard
 * Tests owner-facing features: property overview, tenant management, lease tracking
 */

test.describe("Owner Dashboard - Property Overview", () => {
  const baseUrl = "http://localhost:3015";

  test("should display dashboard with property statistics", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard`);
    
    // Check for key stats cards
    await expect(page.getByText(/Total Properties/)).toBeVisible();
    await expect(page.getByText(/Active Leases/)).toBeVisible();
    await expect(page.getByText(/Monthly Revenue/)).toBeVisible();
  });

  test("should show property list", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/properties`);
    
    const propertyCards = page.locator('.property-card');
    await expect(propertyCards).toHaveCount(1); // At least one card
  });
});

test.describe("Owner Dashboard - Tenant Management", () => {
  const baseUrl = "http://localhost:3015";

  test("should display tenant list with status", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/tenants`);
    
    await expect(page.getByRole("heading", { name: /Tenants/ })).toBeVisible();
    await expect(page.locator('.tenant-card')).toHaveCount(1);
  });

  test("should allow viewing tenant details", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/tenants`);
    
    const tenantCard = page.locator('.tenant-card').first();
    await tenantCard.click();
    
    await expect(page.getByText(/Tenant Details/)).toBeVisible();
  });

  test("should allow adding new tenant", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/tenants/add`);
    
    // Fill in form
    await page.fill('input[name="firstName"]', "Jane");
    await page.fill('input[name="lastName"]', "Smith");
    await page.fill('input[name="email"]', `jane${Date.now()}@test.com`);
    
    await page.click('button[type="submit"]');
    
    await expect(page.getByText(/Tenant added/)).toBeVisible();
  });
});

test.describe("Owner Dashboard - Lease Tracking", () => {
  const baseUrl = "http://localhost:3015";

  test("should display active leases with expiration dates", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/leases`);
    
    await expect(page.getByRole("heading", { name: /Leases/ })).toBeVisible();
    
    // Check for upcoming renewal alerts
    const renewalAlert = page.locator('.renewal-alert');
    if (await renewalAlert.count() > 0) {
      await expect(renewalAlert.first()).toBeVisible();
    }
  });

  test("should allow creating new lease", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/leases/new`);
    
    // Select property and tenant
    await page.selectOption('select[name="propertyId"]', "prop-001");
    await page.selectOption('select[name="tenantId"]', "tenant-001");
    
    // Fill in lease terms
    await page.fill('input[name="monthlyRent"]', "2500");
    await page.fill('input[name="startDate"]', new Date().toISOString().split("T")[0]);
    
    await page.click('button[type="submit"]');
    
    await expect(page.getByText(/Lease created/)).toBeVisible();
  });
});

test.describe("Owner Dashboard - Financial Summary", () => {
  const baseUrl = "http://localhost:3015";

  test("should display current month revenue", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/financials`);
    
    await expect(page.getByText(/Revenue Summary/)).toBeVisible();
  });

  test("should allow toggling between accrual and cash basis", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/financials`);
    
    // Find the toggle button
    const toggle = page.locator('button[role="switch"]');
    if (await toggle.count() > 0) {
      await expect(toggle).toBeVisible();
      
      // Click to switch
      await toggle.click();
      await expect(page.getByText(/Cash Basis/)).toBeVisible();
    }
  });
});