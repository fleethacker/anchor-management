const { test, expect } = require('@playwright/test');

test('upcoming CASREP deadlines paginate through the seeded due set', async ({ page }) => {
  await page.goto('/');
  const deadlines = page.locator('#overview-deadlines');
  await expect(deadlines).toContainText(/Showing 1–10 of \d+/);
  await expect(deadlines.locator('button', { hasText: 'Next' })).toBeEnabled();
  await expect(deadlines.locator('button', { hasText: 'Previous' })).toBeDisabled();

  await deadlines.locator('button', { hasText: 'Next' }).click();
  await expect(deadlines).toContainText(/Showing 11–20 of \d+/);
  await expect(deadlines.locator('button', { hasText: 'Previous' })).toBeEnabled();
  await expect(deadlines.locator('button', { hasText: 'Next' })).toBeEnabled();

  await deadlines.locator('button', { hasText: 'Previous' }).click();
  await expect(deadlines).toContainText(/Showing 1–10 of \d+/);
});
