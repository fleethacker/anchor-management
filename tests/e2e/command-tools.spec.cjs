const {test,expect}=require('@playwright/test');

for(const mode of ['backend','static']){
 test(`${mode}: analysis areas and bulk assignments persist without changing reports`,async({page,request})=>{
  if(mode==='static')await page.route('**/api/v1/health',r=>r.fulfill({status:404,body:'{}'}));
  let settingId;
  try{
   await page.goto('/#analytics');await expect(page.locator('.cda-department-card')).toHaveCount(4);
   const original=await page.evaluate(()=>JSON.stringify(ReadinessApp.store.all()));
   const chosen=await page.evaluate(()=>ReadinessApp.store.all().find(r=>r.assetId&&r.caseStatus==='Active').id);
   await page.getByRole('button',{name:'Add area',exact:true}).click();await page.locator('[name="areaName"]').fill('Navigation');await page.getByRole('button',{name:'Add area',exact:true}).last().click();
   await expect(page.locator('#action-form')).toHaveCount(0);await expect(page.locator('.cda-department-card')).toHaveCount(5);
   await expect(page.locator('.cda-department-card h2')).toHaveText(['Combat Systems','Engineering','Deck','Supply','Navigation']);
   if(mode==='backend'){const body=await request.get('/api/v1/command-settings').then(r=>r.json());settingId=body.data.find(r=>r.name==='analysis-areas').id;}
   await page.getByRole('button',{name:'Assign CASREPs',exact:true}).click();await page.locator('[name="targetArea"]').selectOption('custom-navigation');
   await page.locator('[data-area-case="'+chosen+'"]').check();await page.getByRole('button',{name:'Save assignments',exact:true}).click();await expect(page.locator('#action-form')).toHaveCount(0);
   expect(await page.evaluate(()=>JSON.stringify(ReadinessApp.store.all()))).toBe(original);
   expect(await page.evaluate(id=>ReadinessApp.departmentAnalysis.snapshot().caseEvidence[id].ownership.id,chosen)).toBe('custom-navigation');
   await page.reload();await expect(page.locator('.cda-department-card')).toHaveCount(5);
   await page.getByRole('button',{name:'Open Navigation analysis',exact:true}).click();await expect(page.locator('.cda-workspace')).toHaveAttribute('data-analysis-level','department');
   expect(await page.evaluate(id=>ReadinessApp.departmentAnalysis.snapshot().caseEvidence[id].ownership.id,chosen)).toBe('custom-navigation');
   await expect(page.locator('.analysis-nav')).toBeVisible();await expect(page.locator('#department-analysis-profile,#department-analysis-command')).toHaveCount(0);
   if(mode==='backend'){
    const record=await request.get('/api/v1/command-settings/'+settingId).then(r=>r.json());const revision=record.data.revision;
    const first=await request.patch('/api/v1/command-settings/'+settingId,{data:{expectedRevision:revision,caseDepartments:record.data.caseDepartments}});expect(first.status()).toBe(200);
    const stale=await request.patch('/api/v1/command-settings/'+settingId,{data:{expectedRevision:revision,caseDepartments:{}}});expect(stale.status()).toBe(409);
   }
  }finally{if(settingId)await request.delete('/api/v1/command-settings/'+settingId);}
 });
 test(`${mode}: linked requisitions retain comments and delivery without rewriting the message`,async({page})=>{
  if(mode==='static')await page.route('**/api/v1/health',r=>r.fulfill({status:404,body:'{}'}));
  await page.goto('/#casrep/demo-005');await expect(page.locator('#editor-message')).toBeVisible();
  const original=await page.locator('#editor-message').inputValue();
  const deadline=await page.evaluate(()=>CasrepReporting.resolve(ReadinessApp.store.get('demo-005')).dueAt);
  await page.getByRole('button',{name:'Add requisition',exact:true}).click();await page.locator('[name="part"]').fill('QA linked seal '+mode);await page.locator('[name="quantity"]').fill('2');await page.locator('[name="notes"]').fill('Initial sourcing note');
  await page.getByRole('button',{name:'Save W requisition',exact:true}).click();await expect(page.locator('#action-form')).toHaveCount(0);
  const row=page.locator('.linked-requisition').filter({hasText:'QA linked seal '+mode});await expect(row).toBeVisible();
  await row.getByRole('button',{name:/^Comments for/}).click();await page.locator('[name="author"]').fill('QA Supply');await page.locator('[name="comment"]').fill('Vendor confirmed availability.');await page.getByRole('button',{name:'Add comment',exact:true}).click();await expect(page.locator('#action-form')).toHaveCount(0);
  await row.getByRole('button',{name:/^Delivery for/}).click();await page.locator('[name="eta"]').fill('2026-12-01T12:00');await page.locator('[name="status"]').selectOption('In transit');await page.getByRole('button',{name:'Save delivery',exact:true}).click();await expect(page.locator('#action-form')).toHaveCount(0);
  await page.reload();await expect(row).toContainText('In transit');await row.getByRole('button',{name:/^Comments for/}).click();await expect(page.locator('.requisition-notes')).toContainText('Initial sourcing note');await expect(page.locator('.requisition-notes')).toContainText('QA Supply');await expect(page.locator('.requisition-notes')).toContainText('Vendor confirmed availability.');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.locator('#editor-message').inputValue()).toBe(original);expect(await page.evaluate(()=>CasrepReporting.resolve(ReadinessApp.store.get('demo-005')).dueAt)).toBe(deadline);
 });
}

test('calendar links, compact filters, keyboard rows, dark mode and navigation work together',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('.brand-name')).toHaveText('CASREP Command');await expect(page.locator('.brand-logo')).toBeVisible();
 const count=await page.locator('[data-overview-value="today"]').textContent();await page.locator('[data-overview-period="today"]').click();await expect(page.locator('#registry-count')).toHaveText(new RegExp('^'+count+' of '));
 await page.getByRole('button',{name:'Clear',exact:true}).click();await page.getByRole('button',{name:/^Filters/}).click();await page.locator('[name="registryCategory"]').selectOption('C4');await page.getByRole('button',{name:'Apply filters',exact:true}).click();expect((await page.locator('#registry-results tbody .badge-c4').count())).toBeGreaterThan(0);
 const row=page.locator('#registry-results tbody .data-row').first();await row.focus();await row.press('Enter');await expect(page.locator('#editor-message')).toBeVisible();
 await page.locator('#primary-nav [data-view="routing"]').click();await page.getByRole('button',{name:/^Filters/}).click();await page.locator('[name="queueCategory"]').selectOption('C3');await page.locator('[name="queueStage"]').selectOption('In review');await page.getByRole('button',{name:'Apply filters',exact:true}).click();
 expect((await page.locator('.route-card .badge').allTextContents()).every(v=>v.includes('C3'))).toBe(true);
 await page.locator('#appearance-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 for(const size of [{width:1440,height:1000},{width:1440,height:580},{width:768,height:700},{width:390,height:844}]){
  await page.setViewportSize(size);await page.locator('#primary-nav [data-view="overview"]').evaluate(el=>el.click());
  if(size.width<641)await page.getByRole('button',{name:'Toggle navigation',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const nav=page.locator('.sidebar');expect(await nav.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);await expect(page.locator('#reporting-notifications')).toBeInViewport();
  await expect(page.locator('#overview-deadlines .due-table')).toBeVisible();
  await page.screenshot({path:info.outputPath('command-dark-'+size.width+'-'+size.height+'.png'),animations:'disabled'});
 }
 expect(errors).toEqual([]);
});

test('a failed analysis settings save retains the dialog and existing areas',async({page})=>{
 await page.goto('/#analytics');await expect(page.locator('.cda-department-card')).toHaveCount(4);
 await page.route('**/api/v1/command-settings*',r=>r.request().method()==='POST'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'QA settings unavailable'}})}):r.continue());
 await page.getByRole('button',{name:'Add area',exact:true}).click();await page.locator('[name="areaName"]').fill('QA failed area');await page.getByRole('button',{name:'Add area',exact:true}).last().click();await expect(page.locator('#toast')).toContainText('QA settings unavailable');await expect(page.locator('#action-form')).toHaveCount(1);await expect(page.locator('.cda-department-card')).toHaveCount(4);
});

test('a new draft can persist its equipment link and keep message paper light in dark mode',async({page},info)=>{
 await page.goto('/');await page.getByRole('button',{name:'New CASREP',exact:true}).click();await page.locator('#editor-field-title').fill('QA EQUIPMENT LINK');
 await page.getByRole('button',{name:'Link registered equipment',exact:true}).click();const first=await page.locator('[name="equipmentLink"] option').first().getAttribute('value');await page.locator('[name="equipmentLink"]').selectOption(first);await page.getByRole('button',{name:'Save link',exact:true}).click();await expect(page.locator('#action-form')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add requisition',exact:true})).toBeVisible();await page.reload();await expect(page.locator('#editor-field-title')).toHaveValue('QA EQUIPMENT LINK');expect(await page.evaluate(()=>ReadinessApp.store.get(ReadinessApp.state.editorKey).assetId)).toBe(first);
 await page.locator('#appearance-toggle').click();expect(await page.locator('.editor-page').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
 const text=await page.locator('#editor-message').inputValue();await page.evaluate(()=>{window.print=()=>window.dispatchEvent(new Event('beforeprint'));});await page.getByRole('button',{name:'Print / PDF',exact:true}).click();await expect(page.locator('#casrep-print-root')).toHaveText(text,{useInnerText:false});await page.pdf({path:info.outputPath('dark-mode-message.pdf'),preferCSSPageSize:true});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
});

test('an external area change is detected and a stale dialog cannot overwrite assignments',async({page,request})=>{
 let settingId;
 try{
  await page.goto('/#analytics');await page.getByRole('button',{name:'Add area',exact:true}).click();await page.locator('[name="areaName"]').fill('QA First');await page.getByRole('button',{name:'Add area',exact:true}).last().click();await expect(page.locator('#action-form')).toHaveCount(0);
  const rows=await request.get('/api/v1/command-settings').then(r=>r.json()),record=rows.data.find(r=>r.name==='analysis-areas');settingId=record.id;
  await page.getByRole('button',{name:'Add area',exact:true}).click();await page.locator('[name="areaName"]').fill('QA Stale');
  const changed=await request.patch('/api/v1/command-settings/'+settingId,{data:{expectedRevision:record.revision,areas:record.areas.concat([{id:'custom-external',name:'QA External'}])}});expect(changed.status()).toBe(200);
  await page.getByRole('button',{name:'Add area',exact:true}).last().click();await expect(page.locator('#toast')).toContainText('changed in another session');await expect(page.locator('#action-form')).toHaveCount(1);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.reload();await expect(page.locator('.cda-department-card h2')).toContainText(['QA First','QA External']);await expect(page.getByRole('button',{name:'Open QA Stale analysis',exact:true})).toHaveCount(0);
 }finally{if(settingId)await request.delete('/api/v1/command-settings/'+settingId);}
});
