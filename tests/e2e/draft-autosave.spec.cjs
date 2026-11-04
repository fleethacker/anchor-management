const {test,expect}=require('@playwright/test');

async function start(page){
  await page.goto('/#overview');
  await page.getByRole('button',{name:'New CASREP',exact:true}).click();
  await expect(page.locator('#editor-field-title')).toBeVisible();
}

test('incomplete drafts autosave, reopen, and print while submission stays blocked',async({page,context},info)=>{
  await start(page);
  await page.locator('#editor-field-title').fill('AUTOSAVED INCOMPLETE TEST');
  await expect(page).toHaveURL(/#casrep\/case-/);
  await expect(page.locator('#editor-save-state')).toHaveText('Saved');
  const url=page.url(),id=decodeURIComponent(url.split('#casrep/')[1]);
  const record=await (await page.request.get('/api/v1/cases/'+id)).json();
  expect(record.data.stage).toBe('Draft');
  expect(record.data.title).toBe('AUTOSAVED INCOMPLETE TEST');
  await page.reload();
  await expect(page.locator('#editor-field-title')).toHaveValue('AUTOSAVED INCOMPLETE TEST');
  await page.locator('[data-editor-action="submit"]').click();
  await expect(page.locator('.editor-context')).toContainText('required field check');
  // Print the exact incomplete working copy even while the checks panel is open.
  await page.evaluate(()=>{window.print=()=>window.dispatchEvent(new Event('beforeprint'));});
  const traffic=await page.locator('#editor-message').inputValue();
  await page.locator('[data-editor-action="print"]').click();
  await expect(page.locator('#casrep-print-root')).toHaveText(traffic,{useInnerText:false});
  await page.pdf({path:info.outputPath('incomplete-draft.pdf'),preferCSSPageSize:true});
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  await page.locator('[data-editor-tool="write"]').click();
  const headings=await page.locator('.editor-field-section h3').allTextContents();
  expect(headings).toEqual(['PLADs','Message heading','Casualty','Condition & repair','Remarks']);
  await expect(page.locator('[data-editor-tool="setup"]')).toHaveCount(0);
  // Closing before the debounce runs still keeps the last keystrokes.
  await page.locator('#editor-field-impact').fill('RECOVER THIS LAST EDIT');
  await page.close();
  const reopened=await context.newPage();
  await reopened.goto(url.split('#')[0]);
  await expect(reopened.locator('#editor-field-impact')).toHaveValue('RECOVER THIS LAST EDIT');
  await expect(reopened.locator('#editor-save-state')).toHaveText('Saved');
  await expect(reopened).toHaveURL(url);
});

test('edits during a slow save survive and failures retain a recoverable draft',async({page})=>{
  await start(page);
  await expect(page).toHaveURL(/#casrep\/case-/);
  await expect(page.locator('#editor-save-state')).toHaveText('Saved');
  let release;
  const gate=new Promise(resolve=>release=resolve);
  let saving;
  const started=new Promise(resolve=>saving=resolve);
  await page.route('**/cases/*/actions/save',async route=>{saving();await gate;await route.continue();},{times:1});
  await page.locator('#editor-field-title').fill('FIRST SAVE');
  await started;
  await page.locator('#editor-field-title').fill('LATEST EDIT DURING SAVE');
  release();
  await expect(page.locator('#editor-save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('#editor-field-title')).toHaveValue('LATEST EDIT DURING SAVE');
  await page.route('**/cases/*/actions/save',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'TEST SAVE UNAVAILABLE'}})}));
  await page.locator('#editor-field-title').fill('RECOVER AFTER SAVE FAILURE');
  await expect(page.locator('#editor-save-state')).toContainText('Autosave failed');
  await page.reload();
  await expect(page.locator('#editor-field-title')).toHaveValue('RECOVER AFTER SAVE FAILURE');
  await page.unroute('**/cases/*/actions/save');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.locator('#editor-save-state')).toHaveText('Saved');
});

test('static mode keeps incomplete drafts and last edits across reloads',async({page})=>{
  await page.route('**/api/v1/health',route=>route.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await start(page);
  await page.locator('#editor-field-title').fill('STATIC DRAFT RECOVERY');
  await expect(page.locator('#editor-save-state')).toHaveText('Saved locally');
  await page.locator('#editor-field-description').fill('LATEST STATIC EDIT');
  await page.reload();
  await expect(page.locator('#editor-field-title')).toHaveValue('STATIC DRAFT RECOVERY');
  await expect(page.locator('#editor-field-description')).toHaveValue('LATEST STATIC EDIT');
  await expect(page.locator('#editor-save-state')).toHaveText('Saved locally');
});

test('blocked submission and leaving the editor do not cancel draft autosave',async({page})=>{
  await start(page);
  await page.locator('#editor-field-title').fill('BLOCKED BUT SAVED DRAFT');
  await page.locator('[data-editor-action="submit"]').click();
  await expect(page.locator('.editor-context')).toContainText('required field check');
  await expect(page).toHaveURL(/#casrep\/case-/);
  await expect(page.locator('#editor-save-state')).toHaveText('Saved');
  const url=page.url();
  await page.locator('[data-editor-tool="write"]').click();
  await page.locator('#editor-field-title').fill('LEFT EDITOR AUTOSAVE');
  await page.locator('[data-editor-action="back"]').click();
  const id=decodeURIComponent(url.split('#casrep/')[1]);
  await expect.poll(async()=>{
    const saved=await (await page.request.get('/api/v1/cases/'+id)).json();return saved.data.title;
  }).toBe('LEFT EDITOR AUTOSAVE');
});
