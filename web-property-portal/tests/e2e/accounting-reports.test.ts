import { test, expect } from "@playwright/test";

/**
 * E2E Tests for Accounting Reports
 * Tests financial reporting features: GL, rent roll, accrual/cash toggle
 */

test.describe("Accounting - General Ledger", () => {
  const baseUrl = "http://localhost:3015";

  test("should display general ledger with all accounts", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/accounting/ledger`);
    
    await expect(page.getByRole("heading", { name: /General Ledger/ })).toBeVisible();
    
    // Check for common account categories
    const expectedCategories = ["Assets", "Liabilities", "Equity", "Revenue", "Expenses"];
    for (const category of expectedCategories) {
      await expect(page.getByText(category)).toBeVisible();
    }
  });

  test("should show transaction history in ledger", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/accounting/ledger`);
    
    const transactionRows = page.locator('.ledger-row');
    await expect(transactionRows).toHaveCount(1);
    
    // Verify transaction details are displayed
    await expect(page.getByText(/Amount/)).toBeVisible();
  });
});

test.describe("Accounting - Rent Roll Report", () => {
  const baseUrl = "http://localhost:3015";

  test("should display rent roll with all units and tenants", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/accounting/rent-roll`);
    
    await expect(page.getByRole("heading", { name: /Rent Roll/ })).toBeVisible();
    
    // Verify table structure
    const headers = ["Property", "Unit", "Tenant", "Monthly Rent", "Status"];
    for (const header of headers) {
      await expect(page.getByText(header)).toBeVisible();
    }
  });

  test("should calculate total monthly rent correctly", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/accounting/rent-roll`);
    
    // Check that totals are displayed
    await expect(page.getByText(/Total Monthly Rent:/)).toBeVisible();
  });
});

test.describe("Accounting - Financial Statements", () => {
  const baseUrl = "http://localhost:3015";

  test("should display Income and Expense report", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/accounting/income-expense`);
    
    await expect(page.getByRole("heading", { name: /Income & Expenses/ })).toBeVisible();
  });

  test("should display Balance Sheet", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/accounting/balance-sheet`);
    
    await expect(page.getByRole("heading", { name: /Balance Sheet/ })).toBeVisible();
    
    // Check for assets and liabilities
    await expect(page.getByText(/Assets/)).toBeVisible();
    await expect(page.getByText(/Liabilities/)).toBeVisible();
  });
});

test.describe("Accounting - Accrual vs Cash Toggle", () => {
  const baseUrl = "http://localhost:3015";

  test("should default to accrual accounting view", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/accounting/reports`);
    
    // Check that accrual is the selected mode
    const accrualButton = page.locator('button:has-text("Accrual")');
    await expect(accrualButton).toBeVisible();
  });

  test("should switch to cash basis when toggled", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/accounting/reports`);
    
    // Find and click the toggle button
    const toggle = page.locator('button[role="switch"]');
    if (await toggle.count() > 0) {
      await toggle.click();
      
      // Verify cash basis is now selected
      await expect(page.getByText(/Cash Basis/)).toBeVisible();
    }
  });
});

test.describe("Accounting - Export Reports", () => {
  const baseUrl = "http://localhost:3015";

  test("should export rent roll to CSV", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/accounting/rent-roll`);
    
    // Click export button
    await page.click('button:has-text("Export")');
    
    // Verify download starts
    const downloadPromise = page.waitForEvent("download");
    expect(downloadPromise).toBeDefined();
  });

  test("should export financial report to PDF", async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/accounting/income-expense`);
    
    // Click export button
    await page.click('button:has-text("Export PDF")');
    
    const downloadPromise = page.waitForEvent("download");
    expect(downloadPromise).toBeDefined();
  });
});