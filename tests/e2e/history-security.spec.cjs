const fs = require('node:fs');
const { test, expect } = require('./fixtures.cjs');

const attack = label => `<img data-history-xss src="/missing-history-image-${label}" onerror="window.__historyXss.push('${label}')">`;

// Produce real fictional review history through the workflow first. Hostile
// legacy values are then supplied only by intercepted reads, never API writes.
async function reviewRecord(request) {
  const source = await (await request.get('/api/v1/cases/demo-001')).json();
  const created = await request.post('/api/v1/cases/drafts', {
    data: { traffic: source.data.traffic, actorId: 'originator' }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  let record = (await created.json()).data;
  async function command(action, values = {}) {
    const response = await request.post(`/api/v1/cases/${record.id}/actions/${action}`, {
      data: {
        expectedRevision: record.revision,
        expectedStage: record.stage,
        snapshotId: record.documentReview?.activeSnapshotId,
        reviewerId: 'originator',
        ...values
      }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    record = (await response.json()).data;
  }
  await command('submit');
  await command('comment-add', { start: 0, end: 1, text: 'Fictional historical review comment.' });
  await command('comment-reply', { commentId: record.documentReview.comments[0].id, text: 'Fictional historical reply.' });
  await command('concur', { reviewId: 'divo', reviewerId: 'demo-divo' });
  await command('return', { note: 'Fictional test: preserve the first review round.' });
  await command('submit');
  await command('comment-add', { start: 0, end: 1, text: 'Fictional current review comment.' });
  return record;
}

async function legacyReads(page, record, getLegacy) {
  await page.route('**/api/v1/cases**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || !['/api/v1/cases', `/api/v1/cases/${record.id}`].includes(url.pathname)) {
      return route.continue();
    }
    const response = await route.fetch();
    const body = await response.json();
    if (Array.isArray(body.data)) body.data = body.data.map(item => item.id === record.id ? getLegacy() : item);
    else if (body.data?.id === record.id) body.data = getLegacy();
    await route.fulfill({ response, json: body });
  });
}

async function noExecution(page) {
  await expect(page.locator('[data-history-xss]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__historyXss)).toEqual([]);
}

test('hostile legacy revisions stay text in history, comments, comparison, review and print', async ({ page, request, ownedServer }) => {
  const original = await reviewRecord(request);
  const database = fs.readFileSync(ownedServer.dataPath, 'utf8');
  const legacy = structuredClone(original);
  legacy.revision = attack('current-revision');
  const saved = legacy.documentHistory[0];
  saved.id = 'saved-id-' + attack('attribute');
  saved.revision = attack('saved-revision');
  saved.actor = attack('saved-actor');
  const submitted = legacy.documentReview.snapshots[0];
  submitted.revision = attack('submitted-revision');
  submitted.status = attack('submitted-status');
  submitted.returnReason = attack('return-reason');
  submitted.assignments[0].label = attack('reviewer-label');
  const current = legacy.documentReview.snapshots.at(-1);
  current.revision = attack('current-submitted-revision');
  current.digest = attack('digest');
  const comment = legacy.documentReview.comments[0];
  comment.revision = attack('comment-revision');
  comment.quote = attack('comment-quote');
  comment.text = attack('comment-text');
  comment.replies[0].author = attack('reply-author');
  comment.replies[0].text = attack('reply-text');
  const acknowledgement = legacy.documentReview.acknowledgements[0];
  acknowledgement.revision = attack('approval-revision');
  acknowledgement.decision = attack('approval-decision');
  legacy.events[0].title = attack('event-title');
  legacy.events[0].detail = attack('event-detail');

  const errors = [], writes = [], imageRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => {
    if (req.url().includes('/api/v1/') && !['GET', 'HEAD'].includes(req.method())) writes.push(req.url());
    if (req.url().includes('/missing-history-image-')) imageRequests.push(req.url());
  });
  await page.addInitScript(() => {
    window.__historyXss = [];
    window.__historyPrints = 0;
    window.print = () => { window.__historyPrints++; };
  });
  await legacyReads(page, original, () => structuredClone(legacy));
  await page.goto(`/#casrep/${original.id}`);
  await expect(page.locator('#editor-message')).toHaveValue(original.traffic.text);
  await expect(page.locator('.editor-paper-heading')).toContainText(legacy.revision);
  await expect(page.locator('.editor-statusbar')).toContainText(legacy.revision);
  await noExecution(page);

  await page.locator('[data-editor-tool="history"]').click();
  const context = page.locator('.editor-context-content');
  for (const value of [saved.revision, saved.actor, submitted.revision, submitted.status, submitted.returnReason, comment.revision, comment.quote, comment.text, comment.replies[0].text]) {
    await expect(context).toContainText(value);
  }
  const comparisons = context.locator('[data-editor-compare]');
  expect(await comparisons.first().getAttribute('data-editor-compare')).toBe(saved.id);
  for (let i = 0; i < await comparisons.count(); i++) {
    const expected = i === 0 ? saved : i === 1 ? current : submitted;
    await comparisons.nth(i).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { level: 3 }).first()).toHaveText(`Reviewed revision ${expected.revision}`);
    await expect(dialog.locator('.editor-compare pre').first()).toHaveText(expected.text);
    await noExecution(page);
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  }

  await context.locator('[data-editor-comment-anchor]').last().click();
  await expect(page.getByRole('dialog')).toContainText(comment.revision);
  await expect(page.getByRole('dialog')).toContainText(comment.quote);
  await noExecution(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('[data-editor-tool="comment"]').first().click();
  await expect(page.locator('.editor-context-head')).toContainText(legacy.revision);
  await expect(context).toContainText(comment.replies[0].author);
  await noExecution(page);

  await page.getByRole('tab', { name: 'Review & release' }).click();
  await page.getByText('Approvals & review record', { exact: true }).click();
  await expect(page.locator('.editor-cover')).toContainText(legacy.revision);
  await expect(page.locator('.editor-cover')).toContainText(current.digest);
  for (const value of [acknowledgement.revision, acknowledgement.decision, submitted.assignments[0].label]) {
    await expect(page.locator('.editor-cover table')).toContainText(value);
  }
  await noExecution(page);
  await page.locator('[data-editor-action="case-history"]').click();
  await expect(page.getByRole('dialog')).toContainText(legacy.events[0].title);
  await expect(page.getByRole('dialog')).toContainText(legacy.events[0].detail);
  await noExecution(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('[data-editor-review="divo"]').click();
  await page.locator('[data-editor-tool="sign"]').click();
  await expect(context).toContainText(legacy.revision);
  await noExecution(page);

  await page.locator('[data-editor-action="print"]').click();
  await expect(page.locator('#casrep-print-root pre')).toHaveText(original.traffic.text);
  expect(await page.evaluate(() => window.__historyPrints)).toBe(1);
  await noExecution(page);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect(await page.evaluate(id => ReadinessApp.store.get(id), original.id)).toEqual(legacy);
  await page.locator('#primary-nav [data-view="overview"]').click();
  await page.getByRole('button', { name: 'Export overview', exact: true }).click();
  await expect(page.locator('.co-brief')).toBeVisible();
  await noExecution(page);
  expect((await (await request.get(`/api/v1/cases/${original.id}`)).json()).data).toEqual(original);
  expect(fs.readFileSync(ownedServer.dataPath, 'utf8')).toBe(database);
  expect(writes).toEqual([]);
  expect(imageRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('malformed legacy history remains navigable and explicitly unavailable without rewriting it', async ({ page, request, ownedServer }) => {
  const original = await reviewRecord(request);
  const database = fs.readFileSync(ownedServer.dataPath, 'utf8');
  let legacy = structuredClone(original);
  const malformedText = { toString: null };
  Object.assign(legacy.documentHistory[0], { actor: malformedText, savedAt: malformedText });
  legacy.documentHistory.push(null, { id: 'missing-text', revision: { toString: null } });
  Object.assign(legacy.documentReview.snapshots[0], { status: malformedText, returnReason: malformedText });
  legacy.documentReview.snapshots[0].assignments[0].label = malformedText;
  Object.assign(legacy.documentReview.snapshots.at(-1), { digest: malformedText, submittedAt: malformedText });
  legacy.documentReview.snapshots.push(null);
  Object.assign(legacy.documentReview.comments[0], { text: malformedText, quote: malformedText, author: malformedText, at: malformedText });
  legacy.documentReview.comments[1].replies.push({ text: malformedText, author: malformedText, at: malformedText });
  legacy.documentReview.comments.push(null);
  delete legacy.documentReview.comments[0].replies;
  Object.assign(legacy.documentReview.acknowledgements[0], { decision: malformedText, at: malformedText });
  legacy.documentReview.acknowledgements.push(null);
  Object.assign(legacy.events[0], { title: malformedText, detail: malformedText, actor: malformedText, at: malformedText });
  legacy.versions = { length: attack('version-count') };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.__historyXss = []; });
  await legacyReads(page, original, () => structuredClone(legacy));
  await page.goto(`/#casrep/${original.id}`);
  await expect(page.locator('#editor-message')).toHaveValue(original.traffic.text);
  await page.locator('[data-editor-tool="history"]').click();
  const context = page.locator('.editor-context-content');
  for (const label of ['Saved history entry', 'Submitted history entry', 'Review comment', 'Comment replies']) {
    await expect(context).toContainText(`${label} unavailable: stored metadata is malformed.`);
  }
  await expect(context).toContainText('Saved revision Unavailable');
  await expect(context).toContainText(`Saved revision ${original.documentHistory[0].revision}`);
  await expect(context.locator('.editor-snapshot').filter({ hasText: `Saved revision ${original.documentHistory[0].revision}` }).locator('p')).toHaveText('Unavailable · Unavailable');
  await expect(context.locator('.editor-comment').last().locator('blockquote')).toHaveText('Unavailable');
  await expect(context.locator('.editor-comment').last().locator('p').first()).toHaveText('Unavailable');
  await expect(context.locator('.editor-comment').last().locator('[data-editor-comment-anchor]')).toContainText('Unavailable · Rev');
  await expect(context.locator('.editor-reply p')).toHaveText('Unavailable');
  await expect(context.locator('.editor-reply small')).toHaveText('Unavailable · Unavailable');
  await expect(context).toContainText('Preserved message unavailable.');
  await page.locator('[data-editor-action="case-history"]').click();
  await expect(page.getByRole('dialog')).toContainText('Unavailable release version(s)');
  await expect(page.getByRole('dialog').locator('.timeline-item').last().locator('strong')).toHaveText('Unavailable');
  await expect(page.getByRole('dialog').locator('.timeline-item').last().locator('p')).toHaveText('Unavailable');
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('tab', { name: 'Review & release' }).click();
  await page.getByText('Approvals & review record', { exact: true }).click();
  await expect(page.locator('.editor-cover')).toContainText('Approval record unavailable: stored metadata is malformed.');
  await expect(page.locator('.editor-cover code')).toHaveText('SHA-256 Unavailable');
  await expect(page.locator('.editor-cover tbody tr').last().locator('td').nth(0)).toHaveText('Unavailable');
  await expect(page.locator('.editor-cover tbody tr').last().locator('td').nth(1)).toContainText('Unavailable');
  await noExecution(page);
  expect(await page.evaluate(id => ReadinessApp.store.get(id), original.id)).toEqual(legacy);

  legacy = structuredClone(original);
  legacy.documentHistory = { length: attack('history-count') };
  legacy.documentReview.snapshots = { length: attack('snapshot-count') };
  legacy.documentReview.comments = { length: attack('comment-count') };
  legacy.documentReview.acknowledgements = { length: attack('approval-count') };
  await page.reload();
  await expect(page.locator('#editor-message')).toHaveValue(original.traffic.text);
  await page.locator('[data-editor-tool="history"]').click();
  await expect(context).toContainText('Review comments · Unavailable');
  for (const label of ['Saved history entry', 'Submitted history entry', 'Review comment']) {
    await expect(context).toContainText(`${label} unavailable: stored metadata is malformed.`);
  }
  await page.getByRole('tab', { name: 'Review & release' }).click();
  await page.getByText('Approvals & review record', { exact: true }).click();
  await expect(page.locator('.editor-cover')).toContainText('Approval record unavailable: stored metadata is malformed.');
  await noExecution(page);
  expect(await page.evaluate(id => ReadinessApp.store.get(id), original.id)).toEqual(legacy);
  expect((await (await request.get(`/api/v1/cases/${original.id}`)).json()).data).toEqual(original);
  expect(fs.readFileSync(ownedServer.dataPath, 'utf8')).toBe(database);
  expect(errors).toEqual([]);
});

const persistedLegacyTest = test.extend({
  seedDatabase: async ({ seedDatabase }, use) => {
    for (const [id, snapshots] of [['demo-001', [null]], ['demo-004', {}]]) {
      const record = seedDatabase.cases.find(item => item.id === id);
      delete record.reporting;
      delete record.submittedAt;
      record.documentReview = { snapshots, activeSnapshotId: null, comments: [], acknowledgements: [] };
      record.documentHistory = [{
        id: `legacy-${id}`, revision: attack(`stored-${id}`), text: record.traffic.text,
        actor: { toString: null }, savedAt: { toString: null }
      }];
    }
    await use(seedDatabase);
  }
});

persistedLegacyTest('malformed persisted legacy history without reporting remains readable through calculated API and editor', async ({ page, request, ownedServer }) => {
  const database = fs.readFileSync(ownedServer.dataPath, 'utf8');
  const originals = JSON.parse(database).cases.filter(record => ['demo-001', 'demo-004'].includes(record.id));
  const calculatedResponse = await request.get('/api/v1/cases?reporting=calculated&limit=500');
  expect(calculatedResponse.ok(), await calculatedResponse.text()).toBeTruthy();
  const calculated = (await calculatedResponse.json()).data;
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => {
    if (req.url().includes('/api/v1/') && !['GET', 'HEAD'].includes(req.method())) writes.push(req.url());
  });
  await page.addInitScript(() => { window.__historyXss = []; });
  for (const original of originals) {
    const projection = calculated.find(record => record.id === original.id);
    expect(projection.reportingSchedule.status).toBe('missing');
    expect(projection.reportingSchedule.dueAt).toBeNull();
    expect(projection.reportingSchedule.reason).toBe('Submission date needed: review history unavailable');
    await page.goto(`/#casrep/${original.id}`);
    await expect(page.locator('#editor-message')).toHaveValue(original.traffic.text);
    await expect(page.locator('#editor-deadline')).toContainText('Submission date needed: review history unavailable');
    await page.locator('[data-editor-tool="history"]').click();
    const context = page.locator('.editor-context-content');
    await expect(context).toContainText('Submitted history entry unavailable: stored metadata is malformed.');
    await expect(context).toContainText(original.documentHistory[0].revision);
    await expect(context.locator('.editor-snapshot p')).toHaveText('Unavailable · Unavailable');
    await context.locator('[data-editor-compare]').click();
    await expect(page.getByRole('dialog')).toContainText(original.documentHistory[0].revision);
    await expect(page.getByRole('dialog').locator('.editor-compare pre').first()).toHaveText(original.traffic.text);
    await noExecution(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
    await page.locator('[data-editor-tool="checks"]').click();
    await expect(context.locator('.editor-check.error')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Review & release' }).click();
    await expect(page.locator('.editor-cover')).toBeVisible();
    await noExecution(page);
    expect(await page.evaluate(id => ReadinessApp.store.get(id), original.id)).toEqual(original);
    expect((await (await request.get(`/api/v1/cases/${original.id}`)).json()).data).toEqual(original);
  }
  expect(fs.readFileSync(ownedServer.dataPath, 'utf8')).toBe(database);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
