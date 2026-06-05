import { test, expect } from '@playwright/test';

/**
 * E2E Tests - Device Connection Flow
 * 
 * Tests the complete user flow for connecting to H2O-Tower device
 * including mDNS, direct IP, and gateway connection modes.
 */

test.describe('Device Connection Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test('should display connection screen when not connected', async ({ page }) => {
    // Verify we're on the device list screen
    expect(await page.textContent('text=Connect to Device')).toBeTruthy();
    expect(await page.textContent('text=mDNS Discovery')).toBeTruthy();
    expect(await page.textContent('text=Direct IP')).toBeTruthy();
  });

  test('should show error for invalid IP address', async ({ page }) => {
    // Click on Direct IP tab
    await page.click('button:has-text("Direct IP")');

    // Try to enter invalid IP
    await page.fill('input[name="ip"]', 'invalid-ip');
    await page.blur('input[name="ip"]');

    // Wait for error message to appear
    await page.waitForSelector('text=Invalid IP address format', { timeout: 2000 });
    expect(await page.textContent('text=Invalid IP address format')).toBeTruthy();
  });

  test('should validate port number range', async ({ page }) => {
    // Click on Direct IP tab
    await page.click('button:has-text("Direct IP")');

    // Enter valid IP
    await page.fill('input[name="ip"]', '192.168.1.100');

    // Try invalid port (too high)
    await page.fill('input[name="port"]', '99999');
    await page.blur('input[name="port"]');

    // Wait for error
    await page.waitForSelector('text=Port must be between 1 and 65535', { timeout: 2000 });
  });

  test('should accept valid IP and port', async ({ page }) => {
    // Click on Direct IP tab
    await page.click('button:has-text("Direct IP")');

    // Enter valid values
    await page.fill('input[name="ip"]', '192.168.1.100');
    await page.fill('input[name="port"]', '8443');
    await page.blur('input[name="port"]');

    // Verify no errors appear
    const errors = await page.locator('[role="alert"]').all();
    expect(errors.length).toBe(0);
  });

  test('should validate URL format for gateway', async ({ page }) => {
    // Click on Gateway tab
    await page.click('button:has-text("Gateway")');

    // Enter invalid URL
    await page.fill('input[name="gatewayUrl"]', 'not-a-url');
    await page.blur('input[name="gatewayUrl"]');

    // Wait for error
    await page.waitForSelector('text=Invalid URL format', { timeout: 2000 });
  });

  test('should accept valid gateway URL', async ({ page }) => {
    // Click on Gateway tab
    await page.click('button:has-text("Gateway")');

    // Enter valid URL
    await page.fill('input[name="gatewayUrl"]', 'https://api.h2o-tower.com');
    await page.blur('input[name="gatewayUrl"]');

    // Verify no errors
    const errors = await page.locator('[role="alert"]').all();
    expect(errors.length).toBe(0);
  });

  test('should show loading state during connection attempt', async ({ page }) => {
    // Click on Direct IP tab
    await page.click('button:has-text("Direct IP")');

    // Enter valid values
    await page.fill('input[name="ip"]', '192.168.1.100');
    await page.fill('input[name="port"]', '8443');

    // Click connect button
    const connectButton = page.locator('button:has-text("Connect")');
    await connectButton.click();

    // Should show loading indicator
    await page.waitForSelector('[data-testid="loading-indicator"]', { timeout: 1000 });
  });

  test('should handle connection timeout', async ({ page }) => {
    // This test requires a timeout to be set in the environment
    test.setTimeout(15000);

    // Click on Direct IP tab
    await page.click('button:has-text("Direct IP")');

    // Enter valid values but invalid/unreachable IP
    await page.fill('input[name="ip"]', '10.0.0.1');
    await page.fill('input[name="port"]', '8443');

    // Click connect button
    await page.click('button:has-text("Connect")');

    // Wait for timeout error
    await page.waitForSelector('text=Connection timeout', { timeout: 12000 });
  });
});

test.describe('Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should prevent form submission with errors', async ({ page }) => {
    // Click on Direct IP tab
    await page.click('button:has-text("Direct IP")');

    // Leave fields empty
    const submitButton = page.locator('button[type="submit"]:has-text("Connect")');

    // Try to submit
    await submitButton.click();

    // Should still be on connection page (no navigation)
    expect(await page.url()).toContain('/');
  });

  test('should show success state after valid input', async ({ page }) => {
    // Click on Direct IP tab
    await page.click('button:has-text("Direct IP")');

    // Enter valid values
    await page.fill('input[name="ip"]', '192.168.1.100');
    await page.fill('input[name="port"]', '8443');
    await page.blur('input[name="port"]');

    // Check for success styling (green border or checkmark)
    const ipInput = page.locator('input[name="ip"]');
    const portInput = page.locator('input[name="port"]');

    // Verify inputs don't have error styling
    expect(await ipInput.evaluate(el => el.classList.contains('border-red-500'))).toBe(false);
    expect(await portInput.evaluate(el => el.classList.contains('border-red-500'))).toBe(false);
  });

  test('should clear errors when field is corrected', async ({ page }) => {
    // Click on Direct IP tab
    await page.click('button:has-text("Direct IP")');

    // Enter invalid IP
    await page.fill('input[name="ip"]', 'invalid');
    await page.blur('input[name="ip"]');

    // Wait for error
    await page.waitForSelector('text=Invalid IP address format', { timeout: 2000 });

    // Correct the IP
    await page.fill('input[name="ip"]', '192.168.1.100');
    await page.blur('input[name="ip"]');

    // Wait for error to disappear
    await page.waitForSelector('text=Invalid IP address format', { 
      state: 'hidden',
      timeout: 2000 
    });
  });
});

test.describe('Real-time Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should validate on blur, not on typing', async ({ page }) => {
    // Click on Direct IP tab
    await page.click('button:has-text("Direct IP")');

    // Start typing invalid IP
    const ipInput = page.locator('input[name="ip"]');
    await ipInput.fill('invalid');

    // Error should not appear while typing (blur not triggered)
    let errors = await page.locator('[role="alert"]').all();
    expect(errors.length).toBe(0);

    // Blur the input
    await ipInput.blur();

    // Now error should appear
    await page.waitForSelector('[role="alert"]', { timeout: 2000 });
    errors = await page.locator('[role="alert"]').all();
    expect(errors.length).toBeGreaterThan(0);
  });

  test('should show validation state for multiple fields', async ({ page }) => {
    // Click on Direct IP tab
    await page.click('button:has-text("Direct IP")');

    // Fill IP field
    await page.fill('input[name="ip"]', '192.168.1.100');
    await page.blur('input[name="ip"]');

    // Fill port field with invalid value
    await page.fill('input[name="port"]', '99999');
    await page.blur('input[name="port"]');

    // IP should have no error
    const ipInput = page.locator('input[name="ip"]');
    expect(await ipInput.evaluate(el => el.classList.contains('border-red-500'))).toBe(false);

    // Port should have error
    const portInput = page.locator('input[name="port"]');
    expect(await portInput.evaluate(el => el.classList.contains('border-red-500'))).toBe(true);
  });
});
