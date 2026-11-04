const os = require('node:os');
const path = require('node:path');
const { defineConfig } = require('@playwright/test');

const repo = __dirname;
const dataPath = path.join(os.tmpdir(), `anchor-management-e2e-${process.pid}.json`);

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 }
  },
  webServer: {
    command: `cd backend && go run ./cmd/server -addr 127.0.0.1:4173 -data ${dataPath} -seed data/seed.json -static .. -model-helper scripts/casrep-workflow.cjs`,
    cwd: repo,
    url: 'http://127.0.0.1:4173/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
