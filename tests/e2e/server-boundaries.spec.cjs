const { test, expect } = require('./fixtures.cjs');

test('actual source server exposes only frontend assets and keeps shared rules available', async ({ request, page }) => {
  for (const route of ['/', '/index.html', '/frontend-config.js']) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }
  for (const route of ['/.git/HEAD', '/.env', '/.codex/config.toml', '/backend/',
    '/backend/SPEC.md', '/backend/data/seed.json', '/backend/data/anchor-management.json',
    '/backend/scripts/casrep-workflow.cjs', '/%2egit/HEAD', '/%2e%2e/.env', '/index%2ehtml']) {
    expect((await request.get(route, { maxRedirects: 0 })).status(), route).toBe(404);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await request.fetch('/index.html', { method });
    expect(response.status()).toBe(405);
    expect(response.headers().allow).toBe('GET, HEAD');
  }
  const health = await request.get('/api/v1/health?check=casrep');
  expect(health.status()).toBe(200);
  expect((await health.json()).data.capabilities).toContain('casrep-workflow-v1');
  await page.goto('/');
  await expect(page.locator('#storage-description')).not.toHaveText('Data connection unavailable.');
  await expect(page.locator('h1')).toBeVisible();
});

test('generic API writes reject malformed history atomically and retain valid metadata', async ({ request }) => {
  const url = '/api/v1/cases/demo-rich-1008';
  const before = (await (await request.get(url)).json()).data;
  const invalid = [
    { documentHistory: [{ revision: '<img src=x onerror=alert(1)>' }] },
    { documentReview: { snapshots: [{ revision: '1' }] } },
    { documentReview: { comments: [null] } },
    { documentHistory: 'not an array' }
  ];
  for (const metadata of invalid) {
    for (const method of ['patch', 'put']) {
      const response = await request[method](url, { data: metadata });
      expect(response.status()).toBe(422);
      expect((await (await request.get(url)).json()).data).toEqual(before);
    }
    const response = await request.post('/api/v1/cases', { data: { title: 'Fictional rejected import', ...metadata } });
    expect(response.status()).toBe(422);
  }
  const text = '<img src=x onerror=alert(1)> is untrusted fictional text';
  const history = [{ revision: 0, actor: 'Fictional originator', text, futureField: { retained: true } }];
  const response = await request.patch(url, { data: { documentHistory: history, futureField: 'retained' } });
  expect(response.status()).toBe(200);
  const after = (await (await request.get(url)).json()).data;
  expect(after.documentHistory).toEqual(history);
  expect(after.futureField).toBe('retained');
  expect(after.traffic).toEqual(before.traffic);
});
