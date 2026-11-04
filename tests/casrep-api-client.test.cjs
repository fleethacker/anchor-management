const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script id="casrep-api-client">([\s\S]*?)<\/script>/)[1];
function client(fetch, search = '') {
  const context = vm.createContext({ URLSearchParams, location: { search }, fetch });
  vm.runInContext(source, context);
  return context.CasrepApiClient;
}
const reply = (data, meta, status = 200) => ({ ok: status < 400, status, json: async () => ({ data, meta }) });

test('API snapshot loads every page instead of truncating collections at 500 records', async () => {
  const requests = [];
  const api = client(async target => {
    const url = new URL(target, 'http://localhost');
    requests.push(url.pathname + url.search);
    const total = url.pathname.endsWith('/cases') ? 525 : 2;
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    const rows = Array.from({ length: Math.min(limit, Math.max(0, total - offset)) }, (_, i) => ({ id: offset + i }));
    return reply(rows, { total, limit, offset });
  });
  const snapshot = await api.load();
  assert.equal(snapshot.cases.length, 525);
  assert.equal(snapshot.cases[524].id, 524);
  assert.equal(snapshot.assets.length, 2);
  assert.equal(snapshot.workOrders.length, 2);
  assert.equal(snapshot.requisitions.length, 2);
  assert.equal(snapshot.pladTemplates.length, 2);
  assert.ok(requests.includes('/api/v1/cases?limit=500&offset=500'));
});

test('server due-page metadata and explicit API base remain intact', async () => {
  let requested;
  const api = client(async target => { requested = target; return reply([{ id: 'due-11' }], { total: 27, limit: 10, offset: 10 }); }, '?api=http://example.test/api/v1');
  const page = await api.casesPage({ reporting: 'calculated', limit: 10, offset: 10 });
  assert.equal(page.meta.total, 27);
  assert.equal(page.meta.offset, 10);
  assert.equal(page.records[0].id, 'due-11');
  assert.equal(requested, 'http://example.test/api/v1/cases?reporting=calculated&limit=10&offset=10');
});

test('workflow commands retain concurrency fields and reject unsuccessful writes', async () => {
  let requested, sent;
  const api = client(async (target, options) => {
    requested = target; sent = JSON.parse(options.body);
    return { ok: false, status: 409, json: async () => ({ error: { message: 'revision conflict' } }) };
  });
  await assert.rejects(api.command('case-1', 'submit', { expectedRevision: 3, snapshotId: 'review-1' }), error => error.status === 409 && error.message === 'revision conflict');
  assert.equal(requested, '/api/v1/cases/case-1/actions/submit');
  assert.equal(sent.expectedRevision, 3);
  assert.equal(sent.snapshotId, 'review-1');
});

test('malformed collection responses are errors rather than empty workspaces', async () => {
  const api = client(async () => reply(undefined, undefined));
  await assert.rejects(api.load(), /invalid .* page/);
});

test('the Pages configuration seam supplies the hosted API before client initialization', async () => {
  const tag = '<script src="frontend-config.js"></script>';
  assert.ok(html.indexOf(tag) >= 0 && html.indexOf(tag) < html.indexOf('<script id="casrep-api-client">'));
  const configured = '/hosted/api/v1';
  const built = html.replace(tag, '<script>window.CASREP_API_BASE = '+JSON.stringify(configured)+';</script>');
  assert.equal(built.includes(tag), false);
  let requested;
  const context = vm.createContext({ window: {}, URLSearchParams, location: { search: '' },
    fetch: async target => { requested = target; return reply({ status: 'ok' }); } });
  vm.runInContext('window.CASREP_API_BASE = '+JSON.stringify(configured), context);
  vm.runInContext(source, context);
  await context.window.CasrepApiClient.health();
  assert.equal(requested, '/hosted/api/v1/health');
});
