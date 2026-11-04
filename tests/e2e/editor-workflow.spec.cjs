const { test } = require('@playwright/test');
const { run } = require('../casrep-editor.browser.test.cjs');

test('CASREP editor supports the complete browser workflow', async ({}, testInfo) => {
  await run({
    baseURL: testInfo.project.use.baseURL,
    output: testInfo.outputDir
  });
});
