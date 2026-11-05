const { test, expect } = require('./fixtures.cjs');

const seededCases = [
  ['demo-001', 'INITIAL'],
  ['demo-rich-1008', 'UPDATE'],
  ['aegis-case-constitution-spy-1-01', 'CORRECT']
];

test.describe('materialized demonstration CASREP traffic', () => {
  for (const [id, type] of seededCases) {
    test(`${id} opens as a valid ${type} canonical message`, async ({ page }) => {
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(`/#casrep/${id}`);

      await expect(page.getByRole('heading', { name: 'CASREP editor' })).toBeVisible();
      await expect(page.locator('.editor-heading .eyebrow')).toContainText(type);
      await page.locator('[data-editor-tool="checks"]').click();
      const context = page.locator('.editor-context-content');
      await expect(context).toContainText('All required field checks pass.');
      await expect(context.locator('.editor-check.error')).toHaveCount(0);
      await expect(page.locator('#editor-message')).not.toHaveValue(/\[(?:PRECEDENCE|DTG|MESSAGE SERIAL|CASUALTY ID|EIC|PUBLICATION)\]/);
      expect(pageErrors).toEqual([]);
    });
  }
});
