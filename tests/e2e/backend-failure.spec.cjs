const { test, expect } = require('@playwright/test');

test('configured API failure shows a retry state without local fallback', async ({ page }) => {
  await page.goto('/?api=http://127.0.0.1:9/api/v1');
  await expect(page.getByRole('heading', { name: 'Workspace could not load' })).toBeVisible();
  await expect(page.locator('#storage-description')).toHaveText('Data connection unavailable.');
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText('Data connection unavailable');
});
