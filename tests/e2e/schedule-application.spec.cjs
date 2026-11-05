const {test,expect}=require('@playwright/test');
const {run}=require('../../backend/scripts/casrep-workflow.cjs');
const seed=require('../../backend/data/seed.json');
const schedule='06 NOV: FICTIONAL INTEGRATION PIER\n10 NOV: FICTIONAL INTEGRATION UNDERWAY';
const clone=value=>JSON.parse(JSON.stringify(value));

async function setup(page,request,mode){
  async function command(r,action,payload={}){
    if(mode==='static')return clone(run({cases:r?[r]:[],id:r?.id,action,now:new Date().toISOString(),payload:{expectedRevision:r?.revision,...payload}}).record);
    const response=await request.post(r?'/api/v1/cases/'+r.id+'/actions/'+action:'/api/v1/cases/drafts',{data:{expectedRevision:r?.revision,expectedStage:r?.stage,...payload}});
    expect(response.ok(),await response.text()).toBeTruthy();return (await response.json()).data;
  }
  const records=[];
  for(const stage of ['Draft','In review','Ready for release','Release authorized','Transmitted']){
    let r=await command(null,'save',{traffic:seed.cases[0].traffic});
    if(stage!=='Draft'){
      r=await command(r,'submit');
      for(const review of stage==='In review'?r.reviews.slice(0,1):r.reviews)r=await command(r,'concur',{reviewId:review.id,reviewerId:'demo-'+review.id});
      if(['Release authorized','Transmitted'].includes(stage))r=await command(r,'authorize',{reviewerId:'demo-co'});
      if(stage==='Transmitted')r=await command(r,'transmit',{dtg:'051500ZNOV26',recipients:r.recipients});
    }
    records.push(r);
  }
  if(mode==='static'){
    await page.route('**/api/v1/health',route=>route.fulfill({status:404,contentType:'application/json',body:'{}'}));
    await page.addInitScript(rows=>{if(!localStorage.getItem('schedule-test-initialized')){localStorage.setItem('navy-casrep-prototype-v4-combined-aegis',JSON.stringify({schemaVersion:1,cases:rows}));localStorage.setItem('schedule-test-initialized','true');}},records);
  }else{
    const ids=records.map(r=>r.id);
    // Limit this page's loaded records to its own isolated fixtures. Writes use the real test API.
    await page.route(/\/api\/v1\/cases\?/,async route=>{
      const response=await route.fetch(),body=await response.json();body.data=body.data.filter(r=>ids.includes(r.id));body.meta={total:body.data.length,offset:0,limit:500};await route.fulfill({response,json:body});
    });
  }
  await page.goto('/#schedule');
  return records;
}
async function apply(page){
  await page.getByRole('button',{name:'Edit ship schedule',exact:true}).click();
  await page.getByRole('textbox',{name:'Schedule',exact:true}).fill(schedule);
  await page.getByRole('button',{name:'Save and apply to open reports',exact:true}).click();
}
async function read(page,request,mode,id){
  if(mode==='backend')return (await (await request.get('/api/v1/cases/'+id)).json()).data;
  return page.evaluate(id=>JSON.parse(localStorage.getItem('navy-casrep-prototype-v4-combined-aegis')).cases.find(r=>r.id===id),id);
}

for(const mode of ['backend','static'])test(`${mode}: schedule changes update open drafts, restart reviews and preserve released messages`,async({page,request},info)=>{
  const records=await setup(page,request,mode);
  await expect(page.getByRole('heading',{name:'Schedule Manager',exact:true})).toBeVisible();
  await apply(page);await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.schedule-application-result')).toContainText('3 schedules updated; 2 returned to Draft for fresh review; 2 released/transmitted reports flagged');
  for(const original of records){
    const r=await read(page,request,mode,original.id);
    if(['Draft','In review','Ready for release'].includes(original.stage)){
      expect(r.stage).toBe('Draft');expect(r.traffic.text).toContain('SCHEDULE:');expect(r.traffic.text).toContain('FICTIONAL INTEGRATION PIER');expect(r.revision).toBe(original.revision+1);
      expect(r.reviews.every(review=>review.status==='Pending')).toBeTruthy();
      expect(r.reporting?.submissions).toEqual(original.reporting?.submissions);
      if(original.documentReview){
        expect(r.documentReview.activeSnapshotId).toBeNull();
        expect(r.documentReview.acknowledgements).toEqual(original.documentReview.acknowledgements);
        expect(r.documentReview.snapshots.find(s=>s.id===original.documentReview.activeSnapshotId).text).toBe(original.traffic.text);
      }
    }else{
      expect(r.traffic).toEqual(original.traffic);expect(r.revision).toBe(original.revision);expect(r.stage).toBe(original.stage);
      expect(r.documentReview).toEqual(original.documentReview);expect(r.versions).toEqual(original.versions);
      expect(r.reporting.pendingChanges.some(c=>c.kind==='schedule')).toBeTruthy();
    }
  }
  const review=records[1],before=await read(page,request,mode,review.id);
  await page.reload();await apply(page);await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.schedule-application-result')).toContainText('0 schedules updated; 0 returned to Draft');
  expect(await read(page,request,mode,review.id)).toEqual(before);
  await page.screenshot({path:info.outputPath('schedule-application-results.png')});
});

test('a schedule save failure after returning review is disclosed and retry preserves the prior message',async({page,request})=>{
  const records=await setup(page,request,'backend'),review=records[1];let rejected=false;
  await page.route('**/api/v1/cases/'+review.id+'/actions/save',route=>{
    if(!rejected){rejected=true;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Fictional test save failure'}})});}
    return route.continue();
  });
  await apply(page);await expect(page.getByRole('dialog')).toContainText('Returned to Draft; schedule save failed.');
  const returned=await read(page,request,'backend',review.id);expect(returned.stage).toBe('Draft');expect(returned.traffic).toEqual(review.traffic);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await apply(page);await expect(page.getByRole('dialog')).toHaveCount(0);
  const updated=await read(page,request,'backend',review.id);expect(updated.stage).toBe('Draft');expect(updated.traffic.text).toContain('FICTIONAL INTEGRATION PIER');
  expect(updated.documentReview.snapshots).toEqual(returned.documentReview.snapshots);
});
