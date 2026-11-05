const { test, expect } = require('@playwright/test');

const notes = [
  'Equipment: DEMONSTRATION COOLING PUMP',
  'Category: C3',
  'Condition: Intermittent leakage observed during inspection. Cause remains under investigation.',
  'Impact: Cooling redundancy reduced; remaining capacity has not been confirmed.',
  'Actions: Inspected seal housing. Leak check remains planned.',
  'Mitigation: Standby pump in use subject to verified limits.',
  'Parts: Replacement seal requested; delivery date not provided.',
  'Assistance: Technical review requested.',
  'POC: Demonstration coordinator.'
].join('\n');

async function send(page, text) {
  await page.locator('#ca-chat-input').fill(text);
  await page.locator('.ca-chat-composer button[type="submit"]').click();
}

test('Assistant maps authored facts to equipment, short title, and description', async ({ page }) => {
  await page.goto('/#assistant');
  await page.locator('#ca-chat-input').waitFor();
  await page.locator('[data-ca-task="INITIAL"]').last().click();
  await send(page, notes);
  const card = page.locator('.ca-chat-draft').last();
  await card.locator('summary').click();
  const preview = await card.locator('pre').textContent();
  const fields = await page.evaluate(text => CasrepDocument.fields(text), preview);

  expect(fields.equipment).toBe('DEMONSTRATION COOLING PUMP');
  expect(fields.title).toContain('DEMONSTRATION COOLING PUMP');
  expect(fields.description).toContain('INTERMITTENT LEAKAGE OBSERVED');
  expect(fields.description).toContain('CAUSE REMAINS UNDER INVESTIGATION');
  expect(fields.description).not.toContain('NEED TO CREATE A CASREP');
});

test('Assistant does not treat a create request as equipment', async ({ page }) => {
  await page.goto('/#assistant');
  await page.locator('#ca-chat-input').waitFor();
  await page.locator('[data-ca-task="INITIAL"]').last().click();
  await send(page, 'NEED TO CREATE A CASREP - CASUALTY');
  await send(page, 'Category: C3\nCondition: Seal leakage observed.');

  await expect(page.locator('[data-ca-open-draft]')).toHaveCount(0);
  await expect(page.locator('.ca-chat-messages')).toContainText('Which equipment is affected');
});
