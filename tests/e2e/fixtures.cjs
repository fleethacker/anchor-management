const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test: base, expect } = require('@playwright/test');

const repo = path.resolve(__dirname, '../..');

async function stop(child, closed) {
  if (child.exitCode !== null || child.signalCode !== null) { await closed; return; }
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await closed; } finally { clearTimeout(timeout); }
}

const test = base.extend({
  serverBinary: [async ({}, use, workerInfo) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-e2e-build-'));
    const binary = path.join(directory, 'server');
    const logPath = path.join(workerInfo.project.outputDir, `build-${workerInfo.workerIndex}.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const log = fs.openSync(logPath, 'w');
    const child = spawn('go', ['build', '-o', binary, './cmd/server'], {
      cwd: path.join(repo, 'backend'), stdio: ['ignore', log, log]
    });
    const closed = new Promise(resolve => child.once('close', resolve));
    try {
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
      });
      if (code !== 0) throw new Error(`E2E backend build failed; see ${logPath}`);
      await use(binary);
    } finally {
      await stop(child, closed);
      fs.closeSync(log);
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, { scope: 'worker', timeout: 120_000 }],

  seedDatabase: async ({}, use) => {
    await use(JSON.parse(fs.readFileSync(path.join(repo, 'backend/data/seed.json'), 'utf8')));
  },

  ownedServer: async ({ serverBinary, seedDatabase }, use, testInfo) => {
    const directory = testInfo.outputPath('server-data');
    fs.mkdirSync(directory, { recursive: true });
    const dataPath = path.join(directory, 'database.json');
    fs.writeFileSync(dataPath, JSON.stringify(seedDatabase));
    const logPath = testInfo.outputPath('server.log');
    const log = fs.openSync(logPath, 'w');
    // Only the address announced by this process after net.Listen succeeds is
    // used. An OS-assigned loopback port needs no reusable URL or port race.
    const child = spawn(serverBinary, [
      '-addr', '127.0.0.1:0', '-data', dataPath,
      '-seed', path.join(repo, 'backend/data/seed.json'), '-static', repo,
      '-model-helper', path.join(repo, 'backend/scripts/casrep-workflow.cjs')
    ], {
      cwd: path.join(repo, 'backend'),
      env: { ...process.env, ASSISTANT_PROVIDER: 'none', ASSISTANT_SHARED_PASSWORD: '',
        ASSISTANT_ALLOWED_ORIGINS: '', CORS_ALLOWED_ORIGIN: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const closed = new Promise(resolve => child.once('close', resolve));
    let startupTimer;
    let started = false;
    try {
      const baseURL = await new Promise((resolve, reject) => {
        let output = '';
        const fail = error => { clearTimeout(startupTimer); reject(error); };
        startupTimer = setTimeout(() => fail(new Error(`E2E backend startup timed out; see ${logPath}`)), 30_000);
        child.once('error', fail);
        child.once('exit', (code, signal) => fail(new Error(`E2E backend exited (${code ?? signal}); see ${logPath}`)));
        const capture = chunk => {
          fs.writeSync(log, chunk);
          output = (output + chunk.toString()).slice(-16_384);
          const address = output.match(/anchor-management listening on (127\.0\.0\.1:[1-9]\d*)\r?\n/);
          if (address) { clearTimeout(startupTimer); resolve(`http://${address[1]}`); }
        };
        child.stdout.on('data', capture);
        child.stderr.on('data', capture);
      });
      const health = await fetch(`${baseURL}/api/v1/health`, { signal: AbortSignal.timeout(10_000) });
      if (!health.ok) throw new Error(`Owned E2E backend health failed: ${health.status}`);
      started = true;
      await use({ baseURL, dataPath, process: child });
    } finally {
      clearTimeout(startupTimer);
      await stop(child, closed);
      fs.closeSync(log);
      if (!started || testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('backend-log', { path: logPath, contentType: 'text/plain' });
        await testInfo.attach('fictional-database', { path: dataPath, contentType: 'application/json' });
      } else {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  },

  baseURL: async ({ ownedServer }, use) => use(ownedServer.baseURL),

  verifyOwnedURL: [async ({ baseURL, ownedServer }, use, testInfo) => {
    if (testInfo.project.use.baseURL !== undefined || baseURL !== ownedServer.baseURL) {
      throw new Error('E2E baseURL must be the server owned by this test; external and reused endpoints are unsupported.');
    }
    await use();
  }, { auto: true }]
});

module.exports = { test, expect };
