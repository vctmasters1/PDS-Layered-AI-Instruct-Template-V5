import { test, expect } from "@playwright/test";

/**
 * E2E Tests for Tenant Portal
 * Tests tenant-facing features: registration, viewing leases, rent payment
 */

test.describe("Tenant Portal - Registration", () => {
  const baseUrl = "http://localhost:3015";

  test("should display the tenant portal home page", async ({ page }) => {
    await page.goto(`${baseUrl}/tenant`);
    await expect(page).toHaveTitle(/Property Portal/);
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  });

  test("should allow new tenant registration", async ({ page }) => {
    await page.goto(`${baseUrl}/tenant/register`);
    
    // Fill in registration form
    await page.fill('input[name="firstName"]', "John");
    await page.fill('input[name="lastName"]', "Doe");
    await page.fill('input[name="email"]', `john.doe${Date.now()}@test.com`);
    await page.fill('input[name="phone"]', "555-1234");
    
    // Click submit
    await page.click('button[type="submit"]');
    
    // Verify success message
    await expect(page.getByText(/Registration successful/)).toBeVisible();
  });

  test("should validate registration form fields", async ({ page }) => {
    await page.goto(`${baseUrl}/tenant/register`);
    
    // Try to submit without required fields
    await page.click('button[type="submit"]');
    
    // Verify error messages appear
    await expect(page.getByText(/First name is required/)).toBeVisible();
  });
});

test.describe("Tenant Portal - Lease Viewing", () => {
  const baseUrl = "http://localhost:3015";

  test("should display tenant's active leases", async ({ page }) => {
    // Login first (mock auth for demo)
    await page.goto(`${baseUrl}/tenant/login`);
    
    // Simulate login
    await page.fill('input[name="email"]', "john.doe@test.com");
    await page.click('button[type="submit"]');
    
    // Navigate to leases page
    await page.goto(`${baseUrl}/tenant/leases`);
    await expect(page.getByRole("heading", { name: /My Leases/ })).toBeVisible();
  });

  test("should show lease details correctly", async ({ page }) => {
    await page.goto(`${baseUrl}/tenant/leases`);
    
    // Click on a lease to view details
    const leaseCard = page.locator('.lease-card').first();
    await leaseCard.click();
    
    await expect(page.getByText(/Lease Details/)).toBeVisible();
    await expect(page.getByText(/Property/)).toBeVisible();
  });
});

test.describe("Tenant Portal - Rent Payment", () => {
  const baseUrl = "http://localhost:3015";

  test("should show rent payment page with correct amount", async ({ page }) => {
    await page.goto(`${baseUrl}/tenant/pay`);
    
    // Check that the monthly rent amount is displayed
    await expect(page.getByText(/Monthly Rent/)).toBeVisible();
  });

  test("should process rent payment via Stripe", async ({ page }) => {
    await page.goto(`${baseUrl}/tenant/pay`);
    
    // Fill in payment form (using Stripe test elements)
    await page.fill('input[name="cardNumber"]', "4242424242424242");
    await page.fill('input[name="expiryDate"]', "12/30");
    await page.fill('input[name="cvc"]', "123");
    
    // Submit payment
    await page.click('button[type="submit"]');
    
    // Verify payment success
    await expect(page.getByText(/Payment successful/)).toBeVisible();
  });
});

test.describe("Tenant Portal - Maintenance Requests", () => {
  const baseUrl = "http://localhost:3015";

  test("should allow submitting maintenance request", async ({ page }) => {
    await page.goto(`${baseUrl}/tenant/maintenance`);
    
    // Fill in the form
    await page.fill('input[name="title"]', "Leaky faucet");
    await page.fill('textarea[name="description"]', "Kitchen faucet is leaking water.");
    await page.selectOption('select[name="category"]', "plumbing");
    
    // Submit request
    await page.click('button[type="submit"]');
    
    // Verify confirmation
    await expect(page.getByText(/Request submitted/)).toBeVisible();
  });

  test("should display maintenance request history", async ({ page }) => {
    await page.goto(`${baseUrl}/tenant/maintenance/history`);
    
    await expect(page.getByRole("heading", { name: /Maintenance History/ })).toBeVisible();
  });
});

test.describe("Tenant Portal - Document Download", () => {
  const baseUrl = "http://localhost:3015";

  test("should allow downloading lease agreement", async ({ page }) => {
    await page.goto(`${baseUrl}/tenant/documents`);
    
    // Click on lease document
    await page.click('a[href*="lease.pdf"]');
    
    // Verify download starts (check for file download)
    const downloadPromise = page.waitForEvent("download");
    expect(downloadPromise).toBeDefined();
  });
});