// Broad browser acceptance flow used by tests/e2e/editor-workflow.spec.cjs.
// The runner owns the browser, server, fictional database, and failure artifacts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dtg = (value, envelope = false) => {
  const d = new Date(value), pad = n => String(n).padStart(2, '0');
  const time = pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + 'Z';
  const month = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()];
  return time + (envelope ? ' ' : '') + month + (envelope ? ' ' : '') + String(d.getUTCFullYear()).slice(-2);
};
const now = Date.now();
const complete = `P ${dtg(now, true)}
FM EXERCISE SHIP
TO DEMO ACTION
INFO DEMO INFO
BT
UNCLAS
MSGID/CASREP/EXERCISE SHIP/991//
POSIT/EXERCISE PORT/${dtg(now)}//
CASUALTY/INITIAL-26991/TEST PUMP/EIC:Z901/CAT:4//
AMPN/EXERCISE LEAK.//
ESTIMATE/${dtg(now + 20 * 86400000)}//
ASSIST/NONE//
PARTSID/APL:9990001/-/JCN:EXERCISE-JCN//
TECHPUB/EXERCISE PUBLICATION//
RMKS/EXERCISE EXERCISE EXERCISE. ALL DATA SYNTHETIC.
TITLE: UI TEST CASUALTY
IMPACT: REDUNDANCY REDUCED.
ACTIONS: REPLACE SEAL.
MITIGATION: ALTERNATE PUMP AVAILABLE.
PARTS: SEAL AVAILABLE ON BOARD.
POC: EXERCISE COORDINATOR.//
BT
NNNN
`;

async function run({ page, baseURL, output }) {
  assert.ok(page && baseURL && output, 'Use the Playwright runner and its owned fixtures.');
  const errors = [];
  let passed = 0;
  const check = name => { passed++; console.log('✓ ' + name); };
  const recordError = error => errors.push(error.message);
  fs.mkdirSync(output, { recursive: true });
  page.on('pageerror', recordError);
  try {
    const action = name => page.locator('[data-editor-action="' + name + '"]');
    const editAction = async name => {
      await action(name).first().click();
      await page.locator('[aria-label="CASREP editor"][aria-busy="true"]').waitFor({state:'hidden'});
    };
    const field = name => page.locator('#editor-field-' + name);
    const more = async tool => {
      await page.locator('.editor-document-actions [data-editor-tool="' + tool + '"]').click();
    };
    const selectedText = () => page.locator('#editor-message').evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd));
    const returnDraft = async reason => {
      await page.getByRole('button', { name: 'Return to draft', exact: true }).click();
      await page.locator('#action-form [name="note"]').fill(reason);
      await page.locator('#action-form').getByRole('button', { name: 'Return draft', exact: true }).click();
      await page.locator('#action-form').waitFor({state:'hidden'});
      assert.equal(await page.getByRole('tab', { name: 'Message traffic', exact: true }).getAttribute('aria-selected'), 'true');
    };

    await page.goto(baseURL);
    await page.getByRole('button', { name: 'New CASREP', exact: true }).click();
    assert.equal(await page.locator('h1').textContent(), 'CASREP editor');
    assert.equal(await page.getByRole('tab', { name: 'Case workspace', exact: true }).count(), 0);
    assert.equal(await page.locator('#editor-panel-select, .detail-sheet, .editor-rail').count(), 0);
    assert.equal(await page.locator('[data-editor-tool="setup"], .editor-field-tabs[role="tablist"]').count(), 0);
    assert.equal(await page.locator('.editor-field-section h3').first().textContent(), 'PLADs');
    assert.match(await page.locator('#editor-deadline').innerText(), /Starts on submission/);
    await field('equipment').fill('TEST PUMP');
    assert.ok((await page.locator('#editor-message').inputValue()).includes('/TEST PUMP/'));
    await field('title').fill('UI TEST CASUALTY');
    assert.equal(await page.locator('[data-editor-action="undo"], [data-editor-action="redo"], #editor-more').count(), 0);
    await editAction('submit');
    assert.match(await page.locator('.editor-context').innerText(), /required field checks/);
    assert.equal(await page.locator('#editor-message').getAttribute('readonly'), null);
    check('focused fields synchronize with traffic; direct header tools are visible and incomplete submission is blocked');

    assert.equal(await page.locator('.avatar').count(),0);
    await page.locator('#editor-message').fill(complete);
    assert.ok((await page.locator('#editor-message').inputValue()).split('\n').every(line=>Array.from(line).length<=69));
    await editAction('save');
    const reportURL = page.url();
    assert.match(reportURL, /#casrep\/case-/);
    assert.match(await page.locator('#editor-deadline').innerText(), /Starts on submission/);
    await page.getByRole('button', { name: 'PLAD Manager', exact: true }).click();
    await page.getByRole('button', { name: 'New PLAD template', exact: true }).click();
    await page.locator('#action-form [name="name"]').fill('UI TEST PLAD');
    await page.locator('#action-form [name="recipients"]').fill('DEMO EXTRA\nDEMO EXTRA\nDEMO SECOND');
    await page.locator('#action-form').getByRole('button', { name: 'Save PLAD template' }).click();
    await page.locator('#action-form').waitFor({state:'hidden'});
    await page.goto(reportURL);
    await field('to').scrollIntoViewIfNeeded();
    await page.locator('#editor-plad-options > summary').click();
    await page.locator('#editor-plad').selectOption({ label: 'UI TEST PLAD' });
    assert.match(await page.locator('.editor-context').innerText(), /2 added/);
    await action('apply-plad').click();
    assert.equal(await field('to').inputValue(), 'DEMO ACTION\nDEMO EXTRA\nDEMO SECOND');
    assert.equal(await field('info').inputValue(), 'DEMO INFO');
    await editAction('save');
    assert.equal(await page.locator('[data-editor-tool="find"], [data-editor-tool="outline"], [data-editor-action="update-rules"]').count(),0);
    assert.ok((await page.locator('.editor-context').boundingBox()).width >= 330);
    check('PLAD copy/preview, exact address deduplication, direct header tools remain usable');

    await editAction('submit');
    assert.equal(await page.getByRole('tab', { name: 'Review & release', exact: true }).getAttribute('aria-selected'), 'true');
    const deadline = await page.locator('#editor-deadline-date').innerText();
    assert.match(deadline, /\d{2} \w{3} \d{4} · \d{4}Z/);
    await page.getByRole('button', { name: 'Review as Division Officer', exact: true }).click();
    assert.equal(await page.locator('#editor-message').getAttribute('readonly'), '');
    await page.locator('#editor-message').evaluate(el=>{const at=el.value.indexOf('TEST PUMP');el.focus();el.setSelectionRange(at,at+9);el.dispatchEvent(new Event('select',{bubbles:true}));});
    await more('comment');
    await page.locator('#editor-comment-text').fill('ADD THE POST-REPAIR TEST PLAN.');
    await editAction('comment-add');
    assert.match(await page.locator('.editor-comment').innerText(), /ADD THE POST-REPAIR TEST PLAN/);
    await page.locator('[data-editor-comment-reply]').click();
    await page.locator('#action-form [name="text"]').fill('WILL ADD THE LEAK CHECK.');
    await page.locator('#action-form').getByRole('button', { name: 'Post reply', exact: true }).click();
    await page.locator('#action-form').waitFor({state:'hidden'});
    await returnDraft('Add the leak check and operational test.');
    await field('actions').scrollIntoViewIfNeeded();
    await field('actions').fill('REPLACE SEAL AND RUN A 30-MINUTE LEAK CHECK.');
    await editAction('save');
    assert.equal(await page.locator('#editor-deadline-date').innerText(), deadline);
    await more('history');
    assert.match(await page.locator('.editor-context').innerText(), /Add the leak check and operational test/);
    assert.match(await page.locator('.editor-context').innerText(), /Superseded anchor/);
    await page.locator('[data-editor-compare]').first().click();
    assert.equal(await page.locator('.editor-compare pre').count(), 2);
    await page.locator('#action-form').getByRole('button', { name: 'Done', exact: true }).click();
    await editAction('submit');
    assert.equal(await page.locator('#editor-deadline-date').innerText(), deadline);
    check('anchored feedback, replies, return reason and saved revisions survive resubmission without moving the clock');

    const roles = ['Division Officer', 'Department Head', 'Engineer Officer / CHENG', 'Executive Officer', 'Commanding Officer'];
    for (const role of roles) {
      assert.equal(await page.locator('[data-editor-review]').count(), 1);
      await page.getByRole('button', { name: 'Review as ' + role, exact: true }).click();
      await page.locator('.editor-context [data-editor-tool="sign"]').click();
      await editAction('sign');
    }
    assert.match(await page.locator('.editor-heading').innerText(), /Ready for release/);
    await editAction('release-co');
    assert.match(await page.locator('.editor-heading').innerText(), /Release authorized/);
    await action('case-history').click();
    const audit = await page.locator('#modal-root').innerText();
    for (const role of roles) assert.ok(audit.includes(role));
    assert.match(audit, /Returned for revision/);
    await page.locator('#action-form').getByRole('button', { name: 'Done', exact: true }).click();
    check('all five roles approve in order, with CO release and a complete actor/return audit trail');

    await page.getByRole('tab', { name: 'Message traffic', exact: true }).click();
    const traffic = await page.locator('#editor-message').inputValue();
    assert.ok(traffic.split('\n').every(line=>Array.from(line).length<=69));
    await page.getByRole('tab', { name: 'Review & release', exact: true }).click();
    assert.equal(await action('export').count(),0);
    // Browser print hooks construct a dedicated canonical-message root.
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#app').isVisible(), false);
    assert.equal(await page.locator('#casrep-print-root').textContent(), traffic);
    assert.equal(await page.locator('#casrep-print-root .editor-cover').count(), 0);
    await page.pdf({ path: path.join(output, 'message.pdf'), preferCSSPageSize: true, displayHeaderFooter: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    check('print contains exact traffic, excluding all internal review information');

    await page.getByRole('button', { name: 'Record transmission', exact: true }).first().click();
    await page.locator('#action-form [name="dtg"]').fill(dtg(now));
    await page.locator('#action-form').getByRole('button', { name: 'Record transmission', exact: true }).click();
    await page.locator('#action-form').waitFor({state:'hidden'});
    await editAction('create-update');
    assert.ok((await page.locator('#editor-message').inputValue()).includes('CASUALTY/UPDATE-01-26991/'));
    assert.equal(await page.locator('#editor-deadline-date').innerText(), deadline);
    await field('parts').fill('EXERCISE: SEAL INSTALLED, OPERATIONAL TEST IN PROGRESS.');
    await editAction('save');
    assert.equal(await page.locator('#editor-deadline-label').innerText(), 'Update required');
    await page.locator('#reporting-notifications').click();
    assert.match(await page.locator('#notification-list').innerText(), /UI TEST CASUALTY/);
    await page.locator('#action-form').getByRole('button', { name: 'Done', exact: true }).click();
    await field('dtg').scrollIntoViewIfNeeded();
    await field('dtg').fill(dtg(Date.now(), true));
    await field('serial').fill('992');
    await editAction('submit');
    assert.match(await page.locator('#editor-deadline-label').innerText(), /^Due in/);
    check('follow-on retains identity, changes require updates, and submitted UPDATE starts its next interval');

    await returnDraft('Exercise: inspect the responsive editing layout.');
    await field('actions').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'editor-desktop.png'), fullPage: true });
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.equal(await page.locator('.editor-context').evaluate(el => el.getBoundingClientRect().top < document.querySelector('.editor-desktop').getBoundingClientRect().top), true);
      await page.screenshot({ path: path.join(output, 'editor-' + width + '.png'), fullPage: true });
    }
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
    await page.locator('[data-view="casreps"]').click();
    assert.match(await page.locator('h1').innerText(), /CASREP registry/i);
    await page.getByRole('button',{name:/^Filters/}).click();
    await page.locator('[name="registryDue"]').selectOption('overdue');
    await page.getByRole('button',{name:'Apply filters',exact:true}).click();
    const labels = await page.locator('[data-deadline-badge]').allTextContents();
    assert.ok(labels.every(label => label.includes('Overdue')));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(reportURL);
    await page.getByRole('tab', { name: 'Message traffic', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Review & release', exact: true }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    await field('impact').fill('UNSAVED BUFFER CHECK.');
    await page.locator('[data-view="logistics"]').click();
    await page.goBack();
    assert.equal(await field('impact').inputValue(), 'UNSAVED BUFFER CHECK.');
    await page.locator('#editor-message').press('ControlOrMeta+s');
    await page.locator('#editor-save-state').filter({hasText:/^Saved( locally)?$/}).waitFor({state:'visible'});
    assert.match(await page.locator('#editor-save-state').textContent(), /^Saved( locally)?$/);
    check('phone/tablet layouts, navigation, overdue filters, keyboard tabs/save, and unsaved buffers remain usable');
    assert.deepEqual(errors, []);
    console.log(passed + ' browser acceptance groups passed. Artifacts: ' + output);
  } finally {
    page.off('pageerror', recordError);
  }
}

module.exports = { run };
if (require.main === module) {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', 'tests/e2e/editor-workflow.spec.cjs'], {
    cwd: path.resolve(__dirname, '..'), stdio: 'inherit'
  });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
