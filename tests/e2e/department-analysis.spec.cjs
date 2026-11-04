const {test,expect}=require('@playwright/test');

test('analysis starts with four departments and inventories every loaded CASREP',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/#analytics');
  await expect(page.locator('.cda-department-card')).toHaveCount(4);
  await expect(page.locator('.cda-department-card h2')).toHaveText(['Combat Systems','Engineering','Deck','Supply']);
  await expect(page.locator('[data-system-select]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/export|download/i})).toHaveCount(0);
  const inventory=await page.evaluate(()=>{const s=ReadinessApp.departmentAnalysis.snapshot();return {rows:ReadinessApp.store.all().length,loaded:s.coverage.loadedCaseCount,manifest:s.allCaseIds.length,scoped:s.coverage.analyzedCaseCount,mapped:s.departments.reduce((n,d)=>n+d.metrics.caseCount,0),unassigned:s.unassigned.caseIds.length,review:s.coverage.mappingRequiresReview};});
  expect(inventory.loaded).toBe(inventory.rows);expect(inventory.manifest).toBe(inventory.rows);expect(inventory.mapped+inventory.unassigned).toBe(inventory.scoped);expect(inventory.review).toBe(true);
  await page.getByRole('button',{name:'Open Deck analysis',exact:true}).click();await expect(page.locator('.cda-empty-department')).toContainText('No assigned Deck systems');
  await page.locator('[data-analysis-back="departments"]').click();await page.getByRole('button',{name:'Open Engineering analysis',exact:true}).click();
  await page.locator('.cda-rank-button[data-system-select]').filter({hasText:'Cooling'}).first().click();
  await expect(page.locator('[data-equipment-select]').first()).toBeVisible();await expect(page.locator('[data-part-select]').first()).toBeVisible();
  await page.locator('[data-part-select]').first().click();await expect(page.locator('.cda-workspace')).toHaveAttribute('data-analysis-level','part');
  await expect(page.locator('.cda-evidence-record').first()).toBeVisible();await page.locator('.cda-evidence-record [data-open]').first().click();
  await expect(page.getByRole('heading',{name:'CASREP editor',exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('validated global findings remain usable on drilldown and stale results are rejected',async({page})=>{
  await page.goto('/#analytics');await expect(page.locator('.cda-department-card')).toHaveCount(4);
  const checked=await page.evaluate(()=>{
    const s=ReadinessApp.departmentAnalysis.snapshot(),d=s.departments.find(d=>d.id==='engineering'),system=d.systems.find(s=>s.caseIds.length);
    const result={schemaVersion:s.schemaVersion,snapshotId:s.snapshotId,reviewedCaseIds:s.allCaseIds.slice(),summary:'Complete supplied inventory reviewed for this fictional assessment.',findings:[{id:'test-agent-lead',departmentId:d.id,systemId:system.id,priority:'Investigate',title:'Agent finding for review',observation:'The cited source records a casualty.',rationale:'Review its evidence before establishing a mechanism.',evidenceCaseIds:[system.caseIds[0]],alternativeExplanations:['Reporting coverage or operating conditions may differ.'],recommendedChecks:['Compare the source inspection and operational-test records.'],missingData:['Comparable operating exposure.']}],limitations:['Fictional test interpretation; no connected AI service or engineering diagnosis.']};
    const invalid=ReadinessApp.departmentAnalysis.applyAgentResult({...result,caseCount:99999});const valid=ReadinessApp.departmentAnalysis.applyAgentResult(result);return {invalid:invalid.valid,valid:valid.valid,profile:s.scope.profile};
  });expect(checked.invalid).toBe(false);expect(checked.valid).toBe(true);
  await page.getByRole('button',{name:'Open Engineering analysis',exact:true}).click();await expect(page.getByText('Agent finding for review',{exact:true})).toBeVisible();
  await expect(page.locator('.cda-warning')).toHaveCount(0);
  const stale=await page.evaluate(()=>{const p=ReadinessApp.departmentAnalysis.packet();return ReadinessApp.departmentAnalysis.applyAgentResult({schemaVersion:p.schemaVersion,snapshotId:'stale-id',reviewedCaseIds:p.reviewManifest,summary:'Stale review',findings:[],limitations:['Test only']}).valid;});expect(stale).toBe(false);
  await page.locator('#department-analysis-profile').selectOption(checked.profile==='all'?'FLEET':'all');await expect(page.locator('.cda-warning')).toContainText('stale');
});

test('ownership labels update local analysis including registry assets without changing CASREPs',async({page})=>{
  const writes=[];page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v1/'))writes.push(r.url());});
  await page.goto('/#analytics');await expect(page.locator('.cda-department-card')).toHaveCount(4);
  const before=await page.evaluate(()=>({records:JSON.stringify(ReadinessApp.store.all()),assets:JSON.stringify(ReadinessApp.material.assets())}));
  await page.locator('[data-department-tool="ownership"]').click();const field=page.locator('#action-form label.field').filter({hasText:'Cooling'}).first();await field.locator('select').selectOption('deck');await page.getByRole('button',{name:'Save analysis labels',exact:true}).click();await expect(page.locator('#action-form')).toHaveCount(0);
  const after=await page.evaluate(()=>({records:JSON.stringify(ReadinessApp.store.all()),assets:JSON.stringify(ReadinessApp.material.assets()),deck:ReadinessApp.departmentAnalysis.snapshot().departments.find(d=>d.id==='deck')}));
  expect(after.records).toBe(before.records);expect(after.assets).toBe(before.assets);expect(after.deck.metrics.caseCount).toBeGreaterThan(0);expect(after.deck.metrics.registeredAssets).toBeGreaterThan(0);expect(writes).toEqual([]);
});

test('department pages and contextual Assistant remain usable on phone and tablet',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,768,400]){
    await page.setViewportSize({width,height:900});await page.goto('/#analytics');if(await page.locator('[data-analysis-back="departments"]').count())await page.locator('[data-analysis-back="departments"]').click();await expect(page.locator('.cda-department-card')).toHaveCount(4);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.getByRole('button',{name:'Open Engineering analysis',exact:true}).click();await page.locator('.cda-rank-button[data-system-select]').filter({hasText:'Cooling'}).first().click();
    await page.locator('[data-department-tool="assistant"]').click();await expect(page.locator('#ca-chat-title')).toBeVisible();await expect(page.locator('.ca-chat-heading')).toContainText('Engineering');await expect(page.locator('.ca-chat-heading')).toContainText('Cooling');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:testInfo.outputPath('department-chat-'+width+'.png')});
  }expect(errors).toEqual([]);
});
