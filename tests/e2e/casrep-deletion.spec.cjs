const {test,expect}=require('./fixtures.cjs');
const deleteButton=page=>page.getByRole('button',{name:'Delete CASREP',exact:true});
async function newDraft(page,title){
 await page.goto('/#overview');await page.getByRole('button',{name:'New CASREP',exact:true}).click();
 await page.locator('#editor-field-title').fill(title);
 await expect(page).toHaveURL(/#casrep\/case-/);await expect(page.locator('#editor-save-state')).toHaveText('Saved');
 return decodeURIComponent(page.url().split('#casrep/')[1]);
}
async function confirm(page){await page.getByRole('dialog').getByRole('button',{name:'Delete CASREP',exact:true}).click();}

test('registry and editor delete drafts with confirmation and retain the result after reload',async({page,request})=>{
 const id=await newDraft(page,'DELETE FROM REGISTRY TEST');
 await page.locator('[data-editor-action="back"]').click();
 await page.locator('#case-search').fill('DELETE FROM REGISTRY TEST');
 const row=page.locator('#registry-results tbody tr');await expect(row).toHaveCount(1);
 await row.getByRole('button',{name:/^Delete /}).click();
 await expect(page.getByRole('dialog')).toContainText('DELETE FROM REGISTRY TEST');
 await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
 expect((await request.get('/api/v1/cases/'+id)).status()).toBe(200);
 await row.getByRole('button',{name:/^Delete /}).click();await confirm(page);
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#registry-results tbody tr')).toHaveCount(0);
 expect((await request.get('/api/v1/cases/'+id)).status()).toBe(404);
 await page.reload();await page.locator('#case-search').fill('DELETE FROM REGISTRY TEST');
 await expect(page.locator('#registry-results tbody tr')).toHaveCount(0);
 const second=await newDraft(page,'DELETE FROM EDITOR TEST');
 await page.locator('#editor-field-impact').fill('LAST UNSYNCED EDIT');
 await deleteButton(page).click();await confirm(page);
 await expect(page).toHaveURL(/#casreps$/);
 expect((await request.get('/api/v1/cases/'+second)).status()).toBe(404);
 await page.reload();
 await expect(page.getByRole('heading',{name:'CASREP registry',exact:true})).toBeVisible();
 expect(await page.evaluate(id=>Object.values(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('casrep-draft-recovery-v1:')))||'{}')).some(v=>v===id||(v&&v.meta&&v.meta.id===id)),second)).toBe(false);
});

test('delete waits for a pending initial save and does not resurrect the draft',async({page,request})=>{
 let release,started;const gate=new Promise(r=>release=r),saving=new Promise(r=>started=r);
 await page.route('**/cases/drafts',async route=>{started();await gate;await route.continue();});
 await page.goto('/#overview');await page.getByRole('button',{name:'New CASREP',exact:true}).click();
 await page.locator('#editor-field-title').fill('PENDING INITIAL DELETE TEST');await saving;
 await deleteButton(page).click();await confirm(page);
 const response=page.waitForResponse(r=>r.url().endsWith('/cases/drafts')&&r.request().method()==='POST');
 release();const created=(await (await response).json()).data;
 await expect(page).toHaveURL(/#casreps$/);
 expect((await request.get('/api/v1/cases/'+created.id)).status()).toBe(404);
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'CASREP overview',exact:true})).toBeVisible();
});

test('a failed delete retains the report and permits retry',async({page,request})=>{
 const id=await newDraft(page,'DELETE FAILURE TEST');
 await page.route('**/cases/'+id,route=>route.request().method()==='DELETE'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'TEST DELETE FAILED'}})}):route.continue());
 await deleteButton(page).click();await confirm(page);
 await expect(page.locator('#toast')).toHaveText('TEST DELETE FAILED');
 await expect(page.getByRole('dialog')).toBeVisible();expect((await request.get('/api/v1/cases/'+id)).status()).toBe(200);
 await page.unroute('**/cases/'+id);await confirm(page);
 await expect(page).toHaveURL(/#casreps$/);expect((await request.get('/api/v1/cases/'+id)).status()).toBe(404);
});

test('static-mode deletion persists without restoring a recovery draft',async({page})=>{
 await page.route('**/api/v1/health',route=>route.fulfill({status:404,contentType:'application/json',body:'{}'}));
 await page.goto('/#overview');await page.getByRole('button',{name:'New CASREP',exact:true}).click();
 await page.locator('#editor-field-title').fill('STATIC DELETE TEST');await expect(page.locator('#editor-save-state')).toHaveText('Saved locally');
 const id=decodeURIComponent(page.url().split('#casrep/')[1]);
 await deleteButton(page).click();await confirm(page);await expect(page).toHaveURL(/#casreps$/);
 await page.reload();
 await page.locator('#case-search').fill('STATIC DELETE TEST');await expect(page.locator('#registry-results tbody tr')).toHaveCount(0);
 expect(await page.evaluate(id=>ReadinessApp.store.all().some(r=>r.id===id),id)).toBe(false);
});

test('transmitted, delivered, and follow-on cases cannot be deleted through UI or API',async({page,request})=>{
 for(const [stage,history] of [['Transmitted',[]],['Delivery verified',[]],['Draft',[{dtg:'TEST TRANSMISSION'}]]]){
  const response=await request.post('/api/v1/cases/drafts',{data:{title:'PROTECTED DELETE TEST '+stage,profile:'FLEET'}});
  expect(response.status()).toBe(201);const draft=(await response.json()).data;
  const patched=await request.patch('/api/v1/cases/'+draft.id,{data:{stage,transmissions:history}});
  expect(patched.status()).toBe(200);const record=(await patched.json()).data;
  await page.goto('/?delete-test='+encodeURIComponent(record.id)+'#casrep/'+record.id);await expect(page.locator('#editor-message')).toBeVisible();
  await expect(deleteButton(page)).toHaveCount(0);
  await page.locator('[data-editor-action="back"]').click();await page.locator('#case-search').fill(record.title);
  await expect(page.locator('#registry-results tbody tr')).toHaveCount(1);
  await expect(page.locator('#registry-results [data-action="delete-case"]')).toHaveCount(0);
  expect((await request.delete('/api/v1/cases/'+record.id)).status()).toBe(422);
  expect((await request.get('/api/v1/cases/'+record.id)).status()).toBe(200);
 }
});

test('deleting while an existing save is pending removes the final saved revision',async({page,request})=>{
 const id=await newDraft(page,'EXISTING SAVE DELETE TEST');
 let release,started;const gate=new Promise(r=>release=r),saving=new Promise(r=>started=r);
 await page.route('**/cases/'+id+'/actions/save',async route=>{started();await gate;await route.continue();});
 await page.locator('#editor-field-title').fill('FINAL REVISION BEFORE DELETE');await saving;
 await deleteButton(page).click();await confirm(page);release();
 await expect(page).toHaveURL(/#casreps$/);
 expect((await request.get('/api/v1/cases/'+id)).status()).toBe(404);
 await page.reload();expect((await request.get('/api/v1/cases/'+id)).status()).toBe(404);
});
