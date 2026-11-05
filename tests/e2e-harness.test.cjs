const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const { stripVTControlCharacters } = require('node:util');

const repo = path.resolve(__dirname, '..');
const fixture = path.join(repo, 'tests/e2e/fixtures.cjs');
const outputRoot = path.join(repo, 'test-results');

function run(directory, environment = {}) {
  const logPath = path.join(directory, 'runner.log');
  const log = fs.openSync(logPath, 'w');
  const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', path.join(directory, 'probe.config.cjs')], {
    cwd: repo, env: { ...process.env, ...environment }, stdio: ['ignore', log, log]
  });
  return new Promise((resolve, reject) => {
    child.once('error', error => { fs.closeSync(log); reject(error); });
    child.once('exit', code => { fs.closeSync(log); resolve({ code, log: fs.readFileSync(logPath, 'utf8') }); });
  });
}

function configuration(directory, use = {}) {
  fs.writeFileSync(path.join(directory, 'probe.config.cjs'), `
const config = require(${JSON.stringify(path.join(repo, 'playwright.config.cjs'))});
module.exports = { ...config, testDir: __dirname, testMatch: '*.spec.cjs', retries: 0,
  outputDir: ${JSON.stringify(path.join(directory, 'results'))},
  use: { ...config.use, ...${JSON.stringify(use)} },
  reporter: [['json', { outputFile: ${JSON.stringify(path.join(directory, 'report.json'))} }],
    ['html', { open: 'never', outputFolder: ${JSON.stringify(path.join(directory, 'html'))} }]] };
`);
}

function results(report) {
  return report.suites.flatMap(function walk(suite) {
    return [...(suite.specs || []).flatMap(spec => spec.tests.map(item => ({ title: spec.title, ...item.results[0] }))),
      ...(suite.suites || []).flatMap(walk)];
  });
}

test('owned browser fixtures isolate writes and preserve intentional failure evidence', { timeout: 180_000 }, async () => {
  fs.mkdirSync(outputRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(outputRoot, 'harness-'));
  let requests = 0;
  const sentinel = http.createServer((request, response) => { requests++; response.end('unrelated server'); });
  await new Promise((resolve, reject) => { sentinel.once('error', reject); sentinel.listen(0, '127.0.0.1', resolve); });
  try {
    configuration(directory);
    fs.writeFileSync(path.join(directory, 'isolation.spec.cjs'), `
const { test, expect } = require(${JSON.stringify(fixture)});
test('first fixture can mutate its owned database', async ({ request, baseURL, ownedServer }) => {
  expect(baseURL).toBe(ownedServer.baseURL);
  expect(new URL(baseURL).port).not.toBe(${JSON.stringify(String(sentinel.address().port))});
  const response = await request.patch('/api/v1/cases/demo-rich-1008', { data: { harnessMarker: 'fictional fixture only' } });
  expect(response.status()).toBe(200);
  expect((await (await request.get('/api/v1/cases/demo-rich-1008')).json()).data.harnessMarker).toBe('fictional fixture only');
});
test('second fixture starts from unchanged seed', async ({ request }) => {
  expect((await (await request.get('/api/v1/cases/demo-rich-1008')).json()).data.harnessMarker).toBeUndefined();
});
test('intentional early browser failure', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('h1');
  expect('intentional artifact probe').toBe('expected failure');
});
`);
    fs.writeFileSync(path.join(directory, 'startup.spec.cjs'), `
const { test: base } = require(${JSON.stringify(fixture)});
const test = base.extend({ serverBinary: [async ({}, use) => use(process.execPath), { scope: 'worker' }] });
test('intentional backend startup failure', async ({ page }) => { await page.goto('/'); });
`);
    const result = await run(directory);
    assert.equal(result.code, 1, result.log);
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'));
    const tests = results(report);
    assert.equal(tests.length, 4, result.log);
    assert.equal(tests.find(item => item.title.startsWith('first fixture')).status, 'passed', result.log);
    assert.equal(tests.find(item => item.title.startsWith('second fixture')).status, 'passed', result.log);
    const early = tests.find(item => item.title === 'intentional early browser failure');
    assert.equal(early.status, 'failed');
    assert.match(stripVTControlCharacters(early.error.message), /expected failure/);
    for (const name of ['trace', 'screenshot', 'video', 'backend-log', 'fictional-database']) {
      const attachment = early.attachments.find(item => item.name === name);
      assert.ok(attachment, `Missing ${name}; inspect ${directory}`);
      assert.ok(fs.statSync(attachment.path).size > 0, `Empty ${name}`);
    }
    const startup = tests.find(item => item.title === 'intentional backend startup failure');
    assert.equal(startup.status, 'failed');
    const log = startup.attachments.find(item => item.name === 'backend-log');
    assert.ok(log, `Missing startup log; inspect ${directory}`);
    assert.match(fs.readFileSync(log.path, 'utf8'), /bad option/);
    assert.ok(fs.statSync(path.join(directory, 'html/index.html')).size > 0);
    assert.equal(requests, 0, 'The pre-existing listener must receive no requests.');
    console.log(`Intentional failure evidence retained: ${directory}`);
  } finally { await new Promise(resolve => sentinel.close(resolve)); }
});

test('configured external baseURL and legacy URL override fail before test writes', { timeout: 120_000 }, async () => {
  fs.mkdirSync(outputRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(outputRoot, 'harness-url-'));
  let requests = 0;
  const sentinel = http.createServer((request, response) => { requests++; response.end('unrelated server'); });
  await new Promise(resolve => sentinel.listen(0, '127.0.0.1', resolve));
  try {
    const baseURL = `http://127.0.0.1:${sentinel.address().port}`;
    configuration(directory, { baseURL });
    fs.writeFileSync(path.join(directory, 'url.spec.cjs'), `
const { test } = require(${JSON.stringify(fixture)});
test('URL override is rejected', async ({ request }) => { await request.post('/must-not-write', { data: {} }); });
`);
    const override = await run(directory);
    assert.equal(override.code, 1, override.log);
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'));
    assert.match(results(report)[0].error.message, /baseURL must be the server owned/);
    const legacy = await run(directory, { CASREP_TEST_URL: baseURL });
    assert.equal(legacy.code, 1, legacy.log);
    assert.match(legacy.log, /CASREP_TEST_URL is unsupported/);
    assert.equal(requests, 0);
  } finally { await new Promise(resolve => sentinel.close(resolve)); }
});
