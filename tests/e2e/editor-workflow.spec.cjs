const { test } = require('./fixtures.cjs');
const { run } = require('../casrep-editor.browser.test.cjs');

test('CASREP editor supports the complete browser workflow', async ({ page, baseURL }, testInfo) => {
  await run({
    page,
    baseURL,
    output: testInfo.outputDir
  });
});
