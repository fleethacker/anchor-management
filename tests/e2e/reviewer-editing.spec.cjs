const {test,expect}=require('@playwright/test');

test('reviewer edits restart review before transmission and lock afterwards',async({page,request})=>{
  const source=await (await request.get('/api/v1/cases/demo-001')).json();
  let response=await request.post('/api/v1/cases/drafts',{data:{traffic:source.data.traffic,actorId:'originator'}});
  expect(response.ok()).toBeTruthy();
  let r=(await response.json()).data;
  async function command(action,payload={}){
    const result=await request.post('/api/v1/cases/'+r.id+'/actions/'+action,{data:{expectedRevision:r.revision,expectedStage:r.stage,expectedDigest:await page.evaluate(text=>CasrepDocument.digest(text),r.traffic.text),...payload}});
    expect(result.ok(),await result.text()).toBeTruthy();r=(await result.json()).data;
  }
  await page.goto('/#casrep/'+r.id);
  await expect(page.locator('#editor-message')).toBeVisible();
  for(const stage of ['In review','Ready for release','Release authorized']){
    await command('submit',{reviewerId:'originator'});
    const submitted=r.reporting.submissions[0].submittedAt;
    if(stage!=='In review')for(const reviewer of r.reviews)await command('concur',{reviewId:reviewer.id,reviewerId:'demo-'+reviewer.id});
    else await command('concur',{reviewId:r.reviews[0].id,reviewerId:'demo-'+r.reviews[0].id});
    if(stage==='Release authorized')await command('authorize',{reviewerId:'demo-co'});
    expect(r.stage).toBe(stage);
    const oldSnapshot=r.documentReview.activeSnapshotId,oldApprovals=r.documentReview.acknowledgements.length;
    await page.reload();await page.locator('[data-editor-pane="cover"]').click();
    await page.getByRole('button',{name:'Configure routing',exact:true}).click();
    await expect(page.getByRole('dialog')).toContainText('fresh review');
    await page.locator('.route-config-row').first().locator('[name="route-name"]').fill('TEST '+stage);
    await page.getByRole('button',{name:'Save routing',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    r=(await (await request.get('/api/v1/cases/'+r.id)).json()).data;
    expect(r.stage).toBe('Draft');
    expect(r.documentReview.activeSnapshotId).toBeNull();
    expect(r.documentReview.snapshots.find(s=>s.id===oldSnapshot).status).toBe('Superseded');
    expect(r.documentReview.acknowledgements).toHaveLength(oldApprovals);
    expect(r.reporting.submissions[0].submittedAt).toBe(submitted);
    await page.reload();await page.locator('[data-editor-pane="cover"]').click();
    await page.getByRole('button',{name:'Configure routing',exact:true}).click();
    await expect(page.locator('.route-config-row').first().locator('[name="route-name"]')).toHaveValue('TEST '+stage);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  await command('submit',{reviewerId:'originator'});
  for(const reviewer of r.reviews)await command('concur',{reviewId:reviewer.id,reviewerId:'demo-'+reviewer.id});
  await command('authorize',{reviewerId:'demo-co'});
  await command('transmit',{dtg:'041800ZNOV26',recipients:r.recipients});
  await page.reload();await page.locator('[data-editor-pane="cover"]').click();
  await expect(page.getByRole('button',{name:'Configure routing',exact:true})).toHaveCount(0);
  const rejected=await request.post('/api/v1/cases/'+r.id+'/actions/set-route',{data:{expectedRevision:r.revision,chain:[{id:'co',label:'Commanding Officer'}],reviewerId:'originator'}});
  expect(rejected.status()).toBe(422);
  const unchanged=(await (await request.get('/api/v1/cases/'+r.id)).json()).data;
  expect(unchanged).toEqual(r);
});
