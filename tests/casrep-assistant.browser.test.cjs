'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.CASREP_TEST_URL || 'http://127.0.0.1:4173/';
const output = process.env.CASREP_TEST_OUTPUT || fs.mkdtempSync(path.join(require('node:os').tmpdir(),'casrep-assistant-test-'));
fs.mkdirSync(output, {recursive:true});
const errors = [];
let passed = 0;
const check = label => { passed++; console.log('PASS '+label); };
const notes = [
  'Equipment: DEMONSTRATION COOLING PUMP',
  'Category: C3',
  'Condition: Intermittent leakage observed during the recorded inspection. Cause remains under investigation.',
  'Impact: Cooling redundancy reduced; remaining capacity has not been confirmed.',
  'Actions: Inspected seal housing. Leak check remains planned.',
  'Mitigation: Standby pump in use subject to its verified limits.',
  'Parts: Replacement seal requested; delivery date not provided.',
  'Assistance: Technical review requested.',
  'POC: Demonstration coordinator.'
].join('\n');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_EXECUTABLE});
  async function fresh(hash='') {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(base+hash);
    await page.locator('#casrep-assistant-button:not([disabled])').waitFor();
    return {context,page};
  }
  const open = async page => { await page.locator('#casrep-assistant-button').click(); await page.locator('#ca-chat-input').waitFor(); };
  const send = async (page,text) => { await page.locator('#ca-chat-input').fill(text); await page.locator('.ca-chat-composer button[type="submit"]').click(); };
  const draft = async (page,type,text) => {
    await page.locator('[data-ca-task="'+type+'"]').last().click();
    if(type!=='INITIAL') {
      await page.locator('#ca-chat-source').waitFor();
      const value = await page.locator('#ca-chat-source option').evaluateAll(options => options.find(option => option.value)?.value);
      assert.ok(value, 'eligible follow-on source exists');
      await page.locator('#ca-chat-source').selectOption(value);
      await page.locator('[data-ca-use-source]').click();
    }
    await send(page,text);
    await page.locator('[data-ca-open-draft]').last().waitFor();
    const card = page.locator('.ca-chat-draft').last();
    await card.locator('summary').click();
    return card.locator('pre').textContent();
  };
  try {
    {
      const {context,page} = await fresh();
      const before = await page.evaluate(() => JSON.stringify(ReadinessApp.store.all()));
      await open(page);
      assert.equal(await page.locator('.ca-chat-tasks button').count(), 5);
      assert.match(await page.locator('.ca-chat-welcome').innerText(), /What would you like to do/);
      await page.screenshot({path:path.join(output,'portal-home.png')});
      await page.locator('[data-ca-task="history"]').click();
      await page.locator('.ca-answer .ca-bar-row').first().waitFor();
      assert.ok(await page.locator('[data-ca-case]').count());
      assert.equal(await page.evaluate(() => JSON.stringify(ReadinessApp.store.all())), before);
      check('portal opens with five tasks and sourced local comparison charts without case writes');
      await page.locator('[data-ca-case]').first().click();
      await page.locator('[aria-label="CASREP editor"]').waitFor();
      assert.notEqual(await page.evaluate(() => ReadinessApp.state.editorKey), 'new');
      check('comparison source links open the existing CASREP editor');
      await context.close();
    }
    {
      const {context,page} = await fresh('#assistant');
      await page.locator('#ca-chat-input').waitFor();
      const before = await page.evaluate(() => JSON.stringify(ReadinessApp.store.all()));
      const count = await page.evaluate(() => ReadinessApp.store.all().length);
      const preview = await draft(page,'INITIAL',notes);
      const fields = await page.evaluate(text => CasrepDocument.fields(text),preview);
      assert.match(fields.description,/LEAKAGE/);
      assert.match(fields.description,/CAUSE REMAINS UNDER INVESTIGATION/);
      assert.match(fields.parts,/DELIVERY DATE NOT PROVIDED/);
      assert.ok(preview.split('\n').every(line => Array.from(line).length <= 69));
      assert.equal(await page.evaluate(() => JSON.stringify(ReadinessApp.store.all())), before);
      await page.screenshot({path:path.join(output,'portal-draft.png')});
      await page.locator('[data-ca-open-draft]').last().click();
      await page.locator('#editor-message').waitFor();
      assert.equal(await page.locator('#editor-message').inputValue(),preview);
      assert.equal(await page.evaluate(() => ReadinessApp.state.editorKey),'new');
      assert.equal(await page.evaluate(() => ReadinessApp.store.all().length),count);
      assert.match(await page.locator('#editor-deadline').innerText(),/Starts on submission/);
      await page.locator('[data-editor-action="save"]').click();
      await page.waitForFunction(n => ReadinessApp.store.all().length === n+1,count);
      assert.equal(await page.locator('#editor-message').inputValue(),preview);
      assert.match(await page.locator('#editor-deadline').innerText(),/Starts on submission/);
      await page.reload();
      await page.locator('#editor-message').waitFor();
      assert.equal(await page.locator('#editor-message').inputValue(),preview);
      check('Initial preview opens byte-for-byte in unsaved current-main writer; normal Save persists without starting reporting clock');
      await context.close();
    }
    {
      const {context,page} = await fresh();
      await page.getByRole('button',{name:'New CASREP',exact:true}).click();
      await page.locator('#editor-field-equipment').fill('PRESERVE MY UNSAVED PUMP');
      const protectedText = await page.locator('#editor-message').inputValue();
      await page.getByRole('button',{name:'Overview',exact:true}).click();
      await open(page);
      await draft(page,'INITIAL',notes);
      await page.locator('[data-ca-open-draft]').last().click();
      await page.locator('.ca-chat-notice').waitFor();
      assert.match(await page.locator('.ca-chat-notice').innerText(),/unsaved|working draft|changed/i);
      await page.locator('[data-ca-close]').click();
      await page.getByRole('button',{name:'New CASREP',exact:true}).click();
      assert.equal(await page.locator('#editor-message').inputValue(),protectedText);
      check('an unrelated unsaved Initial is protected from Assistant replacement');
      await context.close();
    }
    for (const type of ['UPDATE','CORRECT','CANCEL']) {
      const {context,page} = await fresh('#assistant');
      const preview = await draft(page,type,'Condition: Current status remains under investigation.\nImpact: Previously reported limitation continues.\nActions: Inspection planned; no restoration claim.');
      await page.locator('[data-ca-open-draft]').last().click();
      await page.locator('#editor-message').waitFor();
      assert.equal(await page.locator('#editor-message').inputValue(),preview);
      const record = await page.evaluate(() => ReadinessApp.store.get(ReadinessApp.state.record));
      assert.equal(record.messageType,type);
      assert.equal(record.stage,'Draft');
      check(type+' uses source-linked guarded follow-on and exact generated traffic');
      await context.close();
    }
    {
      const {context,page} = await fresh('#assistant');
      await page.setViewportSize({width:390,height:844});
      await page.locator('#ca-chat-input').waitFor();
      await page.locator('[data-ca-task="history"]').click();
      await send(page,'Compare systems');
      const box = await page.locator('.ca-chat-composer').boundingBox();
      assert.ok(box && box.y+box.height <= 844,'composer remains inside viewport');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1),'no page-wide horizontal scroll');
      await page.screenshot({path:path.join(output,'portal-mobile.png')});
      await page.reload();
      await page.locator('#ca-chat-input').waitFor();
      assert.match(page.url(),/#assistant$/);
      check('direct Assistant reload and narrow chat composer remain usable');
      await context.close();
    }
    assert.deepEqual(errors,[]);
    console.log(passed+' portal browser groups passed.');
  } catch (error) {
    console.error(error);
    process.exitCode=1;
  } finally { await browser.close(); }
})();
