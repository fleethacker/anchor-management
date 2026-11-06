const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('node:fs/promises');

const routes = ['overview', 'casreps', 'routing', 'logistics', 'plads', 'schedule', 'activity', 'policy', 'analytics', 'assistant', 'casrep/demo-rich-1008'];
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test.beforeEach(async ({ page }) => {
  // These audits must never follow a frontend configuration to a live API.
  await page.route('**/api/**', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4173' ? route.continue() : route.abort());
});

async function scan(page, info, name) {
  const result = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  const path = info.outputPath(name + '-axe.json');
  await fs.writeFile(path, JSON.stringify(result, null, 2));
  await info.attach(name + '-axe.json', { path, contentType: 'application/json' });
  expect.soft(result.violations.map(rule => ({
    id: rule.id,
    count: rule.nodes.length,
    examples: rule.nodes.slice(0, 3).map(node => ({ target: node.target, failure: node.failureSummary }))
  })), name).toEqual([]);
}

async function expectReflow(page) {
  const dimensions = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    return {
      viewport,
      document: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('main,section,article,div,table')]
        .filter(el => el.getBoundingClientRect().right > viewport + 1)
        .slice(0, 12).map(el => ({ element: el.tagName + '.' + el.className, width: el.getBoundingClientRect().width, overflow: getComputedStyle(el).overflowX }))
    };
  });
  expect.soft(dimensions.document, 'Page must not require horizontal scrolling: ' + JSON.stringify(dimensions.overflow)).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectReadableType(page, minimum = 12) {
  const smallText = await page.evaluate(floor => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const failures = [];
    while (walker.nextNode()) {
      const node = walker.currentNode, el = node.parentElement;
      if (!/[a-z0-9]/i.test(node.textContent) || el.closest('script,style,.sr-only,[aria-hidden="true"],.skip-link')) continue;
      const style = getComputedStyle(el);
      if (!el.getClientRects().length || style.visibility === 'hidden') continue;
      const size = parseFloat(style.fontSize);
      if (size > 0 && size < floor - 0.1) failures.push({ text: node.textContent.trim().slice(0, 70), size, element: el.outerHTML.slice(0, 160) });
    }
    return failures;
  }, minimum);
  expect.soft(smallText, 'Visible text must meet the design font-size floor').toEqual([]);
}

for (const theme of ['light', 'dark']) {
  for (const route of routes) {
    test(`${theme}: ${route} meets automated accessibility checks and reflows at 320px`, async ({ page }, info) => {
      await page.addInitScript(value => localStorage.setItem('casrep-command-appearance-v1', value), theme);
      await page.goto('/#' + route);
      await expect(page.locator('#primary-nav button').first()).toBeVisible();
      await expect(page.locator(route === 'assistant' ? '.ca-chat-page' : '#main')).not.toBeEmpty();
      await expectReadableType(page);
      await scan(page, info, 'desktop');
      await page.setViewportSize({ width: 320, height: 800 });
      await expectReflow(page);
      await expectReadableType(page);
      await scan(page, info, '320px');
    });
  }
}

for (const theme of ['light', 'dark']) {
  test(`${theme}: filters, notifications, board, review, and chat history remain accessible`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('casrep-command-appearance-v1', value), theme);
    await page.goto('/#casreps');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await scan(page, info, 'filters');
    await page.keyboard.press('Escape');
    await page.locator('#reporting-notifications').click();
    await scan(page, info, 'notifications');
    await page.keyboard.press('Escape');
    await page.goto('/#routing');
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await scan(page, info, 'board');
    await page.goto('/#casrep/demo-rich-1008');
    await page.getByRole('button', { name: 'Check report', exact: true }).click();
    await scan(page, info, 'checks');
    await page.getByRole('tab', { name: 'Review & release' }).click();
    await scan(page, info, 'review');
    await page.goto('/#assistant');
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close conversation history' })).toBeFocused();
    await scan(page, info, 'chat-history');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'History', exact: true })).toBeFocused();
  });

  test(`${theme}: dialog labels, keyboard containment, and invalid-form recovery`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('casrep-command-appearance-v1', value), theme);
    await page.goto('/#plads');
    const opener = page.getByRole('button', { name: 'New PLAD template', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'New PLAD template' });
    await expect(dialog.getByLabel('Template name')).toBeFocused();
    await expect(page.locator('#app')).toHaveJSProperty('inert', true);
    await dialog.getByRole('button', { name: 'Save PLAD template', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Template name')).toBeFocused();
    await scan(page, info, 'invalid-dialog');
    const close = dialog.getByRole('button', { name: 'Close dialog' });
    const submit = dialog.getByRole('button', { name: 'Save PLAD template', exact: true });
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(submit).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.setViewportSize({ width: 320, height: 480 });
    await expectReflow(page);
    await submit.focus();
    await expect(submit).toBeInViewport();
    await scan(page, info, 'narrow-dialog');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#app')).toHaveJSProperty('inert', false);
    await expect(opener).toBeFocused();
  });
}

test('skip link and mobile navigation work entirely by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/#overview');
  await expect(page.getByRole('heading', { name: 'CASREP overview', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await expect(page).toHaveURL(/#overview$/);
  await expect(page.locator('#primary-sidebar')).toBeHidden();
  const toggle = page.getByRole('button', { name: 'Toggle navigation' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.locator('.brand')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  const registry = page.locator('#primary-nav [data-view="casreps"]');
  await registry.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#casreps$/);
  await expect(page.locator('#main')).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('static fallback and API failure retain accessible status and controls', async ({ page }, info) => {
  await page.route('**/api/v1/health', route => route.fulfill({ status: 404, body: '{}' }));
  await page.goto('/#overview');
  await expect(page.locator('#storage-description')).toHaveText('Changes stay in this browser.');
  await scan(page, info, 'static');
  await page.route('**/api/v1/health', route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/?api=/api/v1');
  await expect(page.getByRole('heading', { name: 'Workspace could not load' })).toBeVisible();
  await scan(page, info, 'connection-failed');
});

test('focus and form boundaries stay visible in both themes and forced colors', async ({ page }) => {
  await page.goto('/#casreps');
  const search = page.getByRole('searchbox');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await search.focus();
    const ratios = await search.evaluate(el => {
      const luminance = color => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
      const style = getComputedStyle(el);
      return { border: contrast(style.borderTopColor, style.backgroundColor), focus: contrast(style.outlineColor, style.backgroundColor), outline: style.outlineStyle };
    });
    expect(ratios.border).toBeGreaterThanOrEqual(3);
    expect(ratios.focus).toBeGreaterThanOrEqual(3);
    expect(ratios.outline).toBe('solid');
  }
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await expect(search).toBeFocused();
  expect(await search.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect(await page.locator('.sidebar').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
});

test('200% text sizing and text spacing preserve reading and actions', async ({ page }, info) => {
  for (const route of ['overview', 'casreps', 'routing', 'plads', 'analytics', 'assistant', 'casrep/demo-rich-1008']) {
    await page.goto('/#' + route);
    await expect(page.locator('#primary-nav button').first()).toBeVisible();
    await page.addStyleTag({ content: 'html:root{font-size:28px!important} body *{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p{margin-bottom:2em!important}' });
    await expectReadableType(page, 24);
    await expectReflow(page);
    expect(await page.locator('.sidebar').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Enlarged navigation labels must stay inside the sidebar').toBe(true);
    expect(await page.locator('.notification-count').evaluate(el => el.scrollHeight <= el.clientHeight + 1), 'Notification counts must fit their badge at enlarged text sizes').toBe(true);
    if (route === 'assistant') {
      const title = await page.locator('#ca-chat-title').boundingBox();
      const status = await page.locator('.ca-chat-heading > small').boundingBox();
      const overlap = title.x < status.x + status.width && title.x + title.width > status.x && title.y < status.y + status.height && title.y + title.height > status.y;
      expect(overlap, 'Assistant title and model status must not overlap at 200% text size').toBe(false);
    }
    await page.screenshot({ path: info.outputPath(route.replaceAll('/', '-') + '-200-percent.png'), fullPage: true });
    if (route === 'assistant') {
      for (const height of [800, 480]) {
        await page.setViewportSize({ width: 320, height });
        const initial = page.getByRole('button', { name: /^Initial/ });
        await initial.scrollIntoViewIfNeeded();
        await expect(initial).toBeInViewport({ ratio: 1 });
        await expectReflow(page);
      }
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath('assistant-200-percent-phone.png'), fullPage: true });
    }
    // Short-height navigation must scroll instead of hiding destinations.
    await page.setViewportSize({ width: 640, height: 320 });
    await page.locator('#menu-toggle').click();
    const guide = page.locator('#policy-shortcut');
    await guide.focus();
    await expect(guide).toBeInViewport();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});
