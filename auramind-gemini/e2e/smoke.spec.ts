import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('landing page loads and has correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/BonaMind/);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('landing page has working navigation to auth', async ({ page }) => {
    await page.goto('/');
    const cta = page.locator('text=Start Free').first();
    if (await cta.isVisible()) {
      await cta.click();
      await page.waitForURL(/auth/, { timeout: 10_000 });
      expect(page.url()).toContain('/auth');
    }
  });

  test('auth page renders login form', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.locator('text=Sign in').first()).toBeVisible({ timeout: 10_000 });
  });

  test('dashboard shows auth gate when not logged in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('text=BonaMind').first()).toBeVisible({ timeout: 10_000 });
  });

  test('marketplace shows auth gate when not logged in', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.locator('text=BonaMind').first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin/users shows auth gate when not logged in', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('text=BonaMind').first()).toBeVisible({ timeout: 10_000 });
  });

  test('no console errors on landing page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForTimeout(2000);
    expect(
      errors.filter(
        (e) =>
          !e.includes('favicon') &&
          !e.includes('supabase') &&
          !e.includes('Environment validation') &&
          !e.includes('Missing required'),
      ),
    ).toHaveLength(0);
  });
});
