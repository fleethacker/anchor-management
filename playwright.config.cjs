const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { defineConfig } = require('@playwright/test');

if (process.env.CASREP_TEST_URL) {
  throw new Error('CASREP_TEST_URL is unsupported: browser tests start their own isolated local server.');
}
// Separate runs retain earlier failure evidence instead of clearing it.
const runID = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  outputDir: path.join(__dirname, 'test-results', runID),
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report', runID) }]],
  use: {
    launchOptions: process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 }
  }
});
