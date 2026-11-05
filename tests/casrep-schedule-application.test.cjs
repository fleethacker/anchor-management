const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {run}=require('../backend/scripts/casrep-workflow.cjs');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context=vm.createContext({TextEncoder});
vm.runInContext(html.match(/<script id="casrep-document-model">([\s\S]*?)<\/script>/)[1],context);
const Doc=context.CasrepDocument;
const traffic=require('../backend/data/seed.json').cases[0].traffic;
const now='2026-11-05T15:00:00.000Z';
const schedule={text:'06 NOV: FICTIONAL TEST PIER\n10 NOV: FICTIONAL TEST UNDERWAY'};
const clone=value=>JSON.parse(JSON.stringify(value));
function command(record,action,payload={}){return clone(run({cases:[record],id:record.id,action,now,payload:{expectedRevision:record.revision,...payload}}).record);}
function fixture(stage){
  let r=clone(run({cases:[],action:'save',now,payload:{traffic}}).record);
  if(stage==='Draft')return r;
  r=command(r,'submit');
  if(stage==='In review')return command(r,'concur',{reviewId:r.reviews[0].id,reviewerId:'demo-'+r.reviews[0].id});
  for(const review of r.reviews)r=command(r,'concur',{reviewId:review.id,reviewerId:'demo-'+review.id});
  if(stage==='Ready for release')return r;
  r=command(r,'authorize',{reviewerId:'demo-co'});
  if(stage==='Release authorized')return r;
  return command(r,'transmit',{dtg:'051500ZNOV26',recipients:r.recipients});
}
function harness(records,fail){
  const current=new Map(records.map(r=>[r.id,clone(r)])),calls=[];
  const store={all:()=>clone([...current.values()]),get:id=>clone(current.get(id))};
  async function write(id,action,payload){
    calls.push({id,action,payload:clone(payload)});
    if(fail)await fail({id,action,payload,current});
    const r=current.get(id);
    if(payload.expectedStage&&payload.expectedStage!==r.stage)throw new Error('This report changed.');
    const saved=command(r,action,payload);current.set(id,saved);return clone(saved);
  }
  store.transition=write;
  store.upsert=(payload,id)=>write(id,'save',payload);
  store.requireUpdate=(id,payload)=>write(id,'require-update',payload);
  const scope=vm.createContext({store,Doc});
  vm.runInContext(html.slice(html.indexOf('  function scheduleText('),html.indexOf('  function scheduleManager(){')),scope);
  return {apply:()=>scope.applyShipSchedule(schedule),current,calls};
}

test('schedule updates drafts and returns review/ready reports for fresh approval, preserving prior evidence and deadlines',async()=>{
  const records=['Draft','In review','Ready for release'].map(fixture),h=harness(records);
  const result=await h.apply();assert.equal(result.updated,3);assert.equal(result.returned,2);assert.equal(result.failed.length,0);
  for(const original of records){
    const r=h.current.get(original.id);assert.equal(r.stage,'Draft');assert.equal(r.revision,original.revision+1);
    assert.equal(Doc.fields(r.traffic.text).schedule,schedule.text);assert.ok(r.reviews.every(review=>review.status==='Pending'));
    assert.deepEqual(r.reporting?.submissions,original.reporting?.submissions);
    if(original.documentReview){
      assert.equal(r.documentReview.activeSnapshotId,null);
      assert.deepEqual(r.documentReview.acknowledgements,original.documentReview.acknowledgements);
      const snapshot=r.documentReview.snapshots.find(s=>s.id===original.documentReview.activeSnapshotId);
      assert.equal(snapshot.text,original.traffic.text);assert.equal(snapshot.status,'Returned');assert.match(snapshot.returnReason,/schedule/);
      assert.equal(h.calls.filter(c=>c.id===r.id)[0].payload.expectedDigest,Doc.digest(original.traffic.text));
    }
  }
  const before=clone([...h.current.values()]);h.calls.length=0;
  const repeat=await h.apply();assert.equal(repeat.unchanged,3);assert.equal(h.calls.length,0);assert.deepEqual([...h.current.values()],before);
});

test('released/transmitted reports only receive flags and closed cases are excluded',async()=>{
  const released=fixture('Release authorized'),sent=fixture('Transmitted'),closed={...fixture('Draft'),caseStatus:'Closed'};
  const h=harness([released,sent,closed]),result=await h.apply();
  assert.equal(result.flagged,2);assert.equal(result.updated,0);assert.equal(result.returned,0);
  for(const original of [released,sent]){
    const r=h.current.get(original.id);assert.equal(r.traffic.text,original.traffic.text);assert.equal(r.revision,original.revision);assert.equal(r.stage,original.stage);
    assert.deepEqual(r.versions,original.versions);assert.deepEqual(r.documentReview,original.documentReview);
    assert.ok(r.reporting.pendingChanges.some(c=>c.kind==='schedule'));
  }
  assert.deepEqual(h.current.get(closed.id),closed);assert.equal(h.calls.some(c=>c.id===closed.id),false);
});

test('a stale return is reported and does not overwrite another revision or stop other drafts',async()=>{
  const review=fixture('In review'),draft=fixture('Draft');
  const h=harness([review,draft],({action,current,id})=>{if(action==='return'){current.get(id).revision++;}});
  const result=await h.apply();assert.equal(result.updated,1);assert.equal(result.returned,0);assert.equal(result.failed.length,1);
  assert.match(result.failed[0],/report changed/);assert.equal(h.current.get(review.id).stage,'In review');assert.equal(h.current.get(review.id).traffic.text,review.traffic.text);
});

test('failed save after return is explicit and retry updates the draft without another return',async()=>{
  const review=fixture('In review');let rejected=false;
  const h=harness([review],({action})=>{if(action==='save'&&!rejected){rejected=true;throw new Error('Test storage failure');}});
  const result=await h.apply();assert.equal(result.updated,0);assert.equal(result.returned,1);assert.match(result.failed[0],/Returned to Draft; schedule save failed/);
  assert.equal(h.current.get(review.id).stage,'Draft');assert.equal(h.current.get(review.id).traffic.text,review.traffic.text);
  const retry=await h.apply();assert.equal(retry.updated,1);assert.equal(retry.returned,0);assert.equal(retry.failed.length,0);
  assert.equal(Doc.fields(h.current.get(review.id).traffic.text).schedule,schedule.text);
});

test('malformed traffic is rejected before returning its review',async()=>{
  const review=fixture('In review');review.traffic.text='FICTIONAL LEGACY MESSAGE WITHOUT REMARKS';
  const h=harness([review]),result=await h.apply();assert.equal(result.failed.length,1);assert.equal(h.calls.length,0);assert.equal(h.current.get(review.id).stage,'In review');
});


test('a matching schedule does not interrupt a new review round',async()=>{
  const h=harness([fixture('Draft')]);await h.apply();
  let r=[...h.current.values()][0];r=command(r,'submit');r=command(r,'concur',{reviewId:r.reviews[0].id,reviewerId:'demo-'+r.reviews[0].id});
  const current=harness([r]),result=await current.apply();assert.equal(result.unchanged,1);assert.equal(result.returned,0);assert.equal(current.calls.length,0);assert.deepEqual(current.current.get(r.id),r);
});

test('missing legacy submission evidence is disclosed instead of counting a flag that was never recorded',async()=>{
  const r=fixture('Release authorized');delete r.reporting;delete r.submittedAt;
  r.events=r.events.filter(event=>!event.title.includes('Submitted'));
  r.documentReview.snapshots=[];
  const h=harness([r]),result=await h.apply();assert.equal(result.flagged,0);assert.equal(result.failed.length,1);assert.match(result.failed[0],/submission date/);
});
