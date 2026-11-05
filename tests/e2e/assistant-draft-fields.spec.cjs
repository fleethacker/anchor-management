const { test, expect } = require('@playwright/test');

const notes = [
  'Title: Main seawater pump seal leaking',
  'Equipment: Main seawater pump No. 2',
  'Category: C3',
  'Condition: Seal leakage confirmed during a local synthetic inspection.',
  'Impact: Reduced seawater-cooling redundancy in the fictional unit. One pump remains available.',
  'Actions: Pump isolated; seal replacement and post-repair test planned.',
  'Mitigation: Alternate pump in service; leakage checks increased.',
  'Parts: Pump seal assembly — demo part · W-DEMO-001 · In transit',
  'Assistance: Regional technical assessment requested.',
  'POC: Engineering duty team · example only'
].join('; ');

async function send(page, text) {
  await page.locator('#ca-chat-input').fill(text);
  await page.locator('.ca-chat-composer button[type="submit"]').click();
}

test('Assistant maps authored facts to equipment, short title, and description', async ({ page }) => {
  await page.goto('/#assistant');
  await page.locator('#ca-chat-input').waitFor();
  await page.locator('[data-ca-task="INITIAL"]').last().click();
  await send(page, notes);
  const review = page.locator('.ca-fact-review').last();
  await expect(review).toContainText('CHECK FACTS BEFORE DRAFTING');
  await expect(review).toContainText('Main seawater pump No. 2');
  await expect(page.locator('[data-ca-open-draft]')).toHaveCount(0);
  await review.locator('[data-ca-confirm-facts]').click();
  const card = page.locator('.ca-chat-draft').last();
  await card.locator('summary').click();
  const preview = await card.locator('pre').textContent();
  const fields = await page.evaluate(text => CasrepDocument.fields(text), preview);

  expect(fields.title).toBe('Main seawater pump seal leaking');
  expect(fields.equipment).toBe('Main seawater pump No. 2');
  expect(fields.description).toBe('Seal leakage confirmed during a local synthetic inspection.');
  expect(fields.impact).toBe('Reduced seawater-cooling redundancy in the fictional unit. One pump remains available.');
  expect(fields.actions).toBe('Pump isolated; seal replacement and post-repair test planned.');
  expect(fields.mitigation).toBe('Alternate pump in service; leakage checks increased.');
  expect(fields.parts).toBe('Pump seal assembly — demo part · W-DEMO-001 · In transit');
  expect(fields.assistance).toBe('Regional technical assessment requested.');
  expect(fields.poc).toBe('Engineering duty team · example only');
  expect(fields.category).toBe('3');
});

test('Assistant does not copy an example form into a new draft', async ({ page }) => {
  await page.goto('/#casrep/demo-001');
  await page.locator('#editor-message').waitFor();
  await page.locator('#casrep-assistant-button').click();
  await page.locator('#ca-chat-input').waitFor();
  await page.locator('[data-ca-task="INITIAL"]').last().click();
  await send(page, 'Create a CASREP.');

  await expect(page.locator('[data-ca-open-draft]')).toHaveCount(0);
  await expect(page.locator('.ca-chat-messages')).toContainText('Which equipment is affected');
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
