const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context = vm.createContext({TextEncoder,crypto});
for(const id of ['casrep-demo-catalog','casrep-aegis-model','casrep-aegis-demo','casrep-document-model','casrep-reporting-model','casrep-data-model']){
  vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],context,{filename:id});
}
const D=context.CasrepDocument, Core=context.CasrepCore;
let passed=0;
function test(name,fn){fn();passed++;console.log('✓ '+name);}
function storage(){const data={};return {getItem:key=>data[key]||null,setItem:(key,value)=>{data[key]=value;}};}
const adapter=storage(),store=Core.createStore(adapter);
function completeTraffic(type='INITIAL'){
  const traffic=D.create({title:'PUMP CASUALTY',equipment:'PUMP NO 2',category:'C3',description:'DISCOVERED LEAKAGE.',impact:'REDUNDANCY REDUCED.',actions:'REPLACE SEAL.',mitigation:'ALTERNATE PUMP IN SERVICE.',parts:'W-DEMO-001.',poc:'EXERCISE COORDINATOR.',assistance:'NONE',messageType:type,initialDtg:'010900ZNOV26'});
  traffic.text=traffic.text.replaceAll('[PRECEDENCE]','P').replaceAll('[DTG]','041700Z NOV 26').replaceAll('[CLASSIFICATION / HANDLING - VERIFY]','DEMONSTRATION ONLY').replaceAll('[ACTION RECIPIENT]','DEMO ACTION').replaceAll('[INFO RECIPIENT]','DEMO INFO').replaceAll('[MESSAGE SERIAL]','001').replaceAll('[POSITION]','DEMO PORT').replaceAll('[POSITION DTG]','041700ZNOV26').replaceAll('[CASUALTY ID]','26001').replaceAll('[UPDATE SEQUENCE]','01').replaceAll('[EIC]','Z901').replaceAll('[REPAIR DTG]','061800ZNOV26').replaceAll('[APL]','9990001').replaceAll('[JCN]','DEMO-JCN').replaceAll('[PUBLICATION]','EXERCISE PUBLICATION');
  return traffic;
}
test('SHA-256 matches standard vectors and exact UTF-8 content',()=>{
  for(const text of ['','abc','a'.repeat(1000),'A\nB\n','A\nB','é 🔧'])assert.equal(D.digest(text),crypto.createHash('sha256').update(text).digest('hex'));
});
test('document fields retain whitespace and unknown sets',()=>{
  let traffic=completeTraffic();traffic.text=traffic.text.replace('RMKS/','CUSTOM/UNKNOWN  TEXT//\nRMKS/');
  const old=traffic.text,range=D.ranges(old).impact;
  traffic.text=D.update(old,'impact','  A NEW IMPACT  ');
  assert.equal(traffic.text,old.slice(0,range.start)+'  A NEW IMPACT  '+old.slice(range.end));
  assert.equal(D.fields(traffic.text).impact,'A NEW IMPACT  '); // spaces after the label are envelope spacing
  assert.ok(traffic.text.includes('CUSTOM/UNKNOWN  TEXT//'));
  assert.throws(()=>D.update(traffic.text,'reference','ANYTHING'),/missing/);
});
test('empty fields and exact-address deduplication do not damage traffic',()=>{
  const t=completeTraffic(),empty=D.update(t.text,'to','');
  assert.equal(D.fields(empty).to,'');assert.ok(empty.startsWith('P 041700Z NOV 26\nFM'));
  const result=D.applyRecipients(empty,'DEMO ACTION\nDEMO ACTION\nDEMO OTHER','to','replace');
  assert.equal(D.fields(result).to,'DEMO ACTION\nDEMO OTHER');assert.equal(D.fields(result).info,'DEMO INFO');
});
test('all four demo templates validate and missing controlled fields block review',()=>{
  for(const type of Core.messageTypes){const traffic=completeTraffic(type);assert.deepEqual(Array.from(D.validate(traffic.text,type).filter(i=>i.severity==='error')),[]);}
  const errors=D.validate(D.create({}).text,'INITIAL');assert.ok(errors.some(i=>i.key==='eic'));assert.ok(errors.some(i=>i.key==='casualty'));assert.ok(errors.every(i=>i.line>=1));
});
let record;
test('new document saves the canonical message and existing case relationships',()=>{
  record=store.upsert({traffic:completeTraffic(),assetId:'asset-01',pladTemplateId:'test-plad'});
  assert.equal(record.stage,'Draft');assert.equal(record.equipment,'PUMP NO 2');assert.equal(record.impact,'REDUNDANCY REDUCED.');assert.equal(record.recipients,'DEMO ACTION\nDEMO INFO');assert.equal(record.assetId,'asset-01');assert.equal(record.pladTemplateId,'test-plad');
});
test('store field updates also synchronize canonical text',()=>{
  record=store.upsert({impact:'NEW STRUCTURED IMPACT.'},record.id);assert.equal(D.fields(record.traffic.text).impact,'NEW STRUCTURED IMPACT.');
  assert.throws(()=>store.upsert({recipients:'UNREVIEWED DISTRIBUTION'},record.id),/controlled TO\/INFO/);
});
test('review locks exact content and every material/recipient edit path',()=>{
  record=store.transition(record.id,'submit');assert.equal(record.stage,'In review');
  const review=record.documentReview.snapshots[0];assert.equal(review.text,record.traffic.text);assert.equal(review.digest,D.digest(record.traffic.text));
  assert.throws(()=>store.upsert({impact:'BYPASS'},record.id),/locked/);
  assert.throws(()=>store.upsert({recipients:'BYPASS'},record.id),/locked/);
  const changed=JSON.parse(JSON.stringify(record.traffic));changed.text+='X';assert.throws(()=>store.upsert({traffic:changed},record.id),/locked/);
  assert.throws(()=>store.transition(record.id,'concur',{reviewId:'divo',reviewerId:'demo-department'}),/assigned/);
});
test('comments retain anchors, replies, authors, and source revisions',()=>{
  const payload={snapshotId:record.documentReview.activeSnapshotId,reviewerId:'demo-divo',start:0,end:10,text:'CHECK PRECEDENCE'};
  assert.throws(()=>store.reviewComment(record.id,'add',{...payload,reviewerId:'writer'}),/assigned/);
  record=store.reviewComment(record.id,'add',payload);const comment=record.documentReview.comments[0];assert.equal(comment.quote,record.traffic.text.slice(0,10));assert.equal(comment.revision,record.revision);
  record=store.reviewComment(record.id,'reply',{...payload,commentId:comment.id,text:'REPLY'});assert.equal(record.documentReview.comments[0].replies[0].text,'REPLY');
  record=store.reviewComment(record.id,'resolve',{...payload,commentId:comment.id});assert.equal(record.documentReview.comments[0].resolved,true);
});
test('acknowledgements do not change traffic or digest',()=>{
  const before=record.traffic.text,digest=D.digest(before);
  record=store.transition(record.id,'concur',{reviewId:'divo',reviewerId:'demo-divo'});
  assert.equal(record.traffic.text,before);assert.equal(D.digest(record.traffic.text),digest);assert.equal(record.documentReview.acknowledgements[0].digest,digest);
});
test('explicit return and editing preserve history and invalidate applicability',()=>{
  assert.throws(()=>store.transition(record.id,'return',{}),/reason/);
  const priorRevision=record.revision,priorSnapshot=record.documentReview.activeSnapshotId;
  record=store.transition(record.id,'return',{note:'REVISE IMPACT'});assert.equal(record.documentReview.activeSnapshotId,null);
  const traffic=JSON.parse(JSON.stringify(record.traffic));traffic.text=D.update(traffic.text,'impact','UPDATED MISSION IMPACT.');
  record=store.upsert({traffic},record.id);assert.equal(record.revision,priorRevision+1);assert.equal(record.documentReview.snapshots[0].id,priorSnapshot);assert.equal(record.documentReview.snapshots[0].returnReason,'REVISE IMPACT');assert.equal(record.documentReview.acknowledgements.length,1);assert.equal(record.documentReview.comments.length,1);
  record=store.transition(record.id,'submit');assert.notEqual(record.documentReview.activeSnapshotId,priorSnapshot);assert.ok(record.reviews.every(r=>r.status==='Pending'));
  assert.throws(()=>store.reviewComment(record.id,'resolve',{commentId:record.documentReview.comments[0].id,reviewerId:'demo-divo'}),/superseded/);
});
test('release remains immutable and a follow-on preserves previous reviewed traffic',()=>{
  for(const role of ['divo','department','cheng','xo','co'])record=store.transition(record.id,'concur',{reviewId:role,reviewerId:'demo-'+role});
  assert.equal(record.stage,'Ready for release');record=store.transition(record.id,'authorize',{reviewerId:'demo-co'});
  assert.throws(()=>store.upsert({title:'BYPASS RELEASE'},record.id),/locked/);
  const released=record.traffic.text;
  record=store.transition(record.id,'transmit',{dtg:'DEMO-EXTERNAL-REFERENCE',recipients:record.recipients});
  record=store.transition(record.id,'followup',{type:'UPDATE'});assert.equal(record.stage,'Draft');assert.equal(record.messageType,'UPDATE');assert.ok(record.traffic.text.includes('UPDATE-01-26001'));assert.ok(record.versions.some(v=>v.record.traffic.text===released));assert.equal(record.documentReview.activeSnapshotId,null);
});
test('stale editors cannot overwrite another editor revision',()=>{
  const other=Core.createStore(adapter),stale=other.get(record.id),traffic=JSON.parse(JSON.stringify(record.traffic));traffic.text=D.update(traffic.text,'impact','CONCURRENT CONTENT.');
  store.upsert({traffic},record.id);
  assert.throws(()=>other.upsert({traffic:stale.traffic,expectedRevision:stale.revision,expectedDigest:D.digest(stale.traffic.text)},record.id),/another editor/);
});
test('PLAD snapshots stay independent of later library changes',()=>{
  const t=completeTraffic(),template={id:'plad-1',recipients:'EXACT ADDRESS\nEXACT ADDRESS'};
  t.text=D.applyRecipients(t.text,template.recipients,'to','replace');t.recipientSnapshots.push({templateId:template.id,sourceAddresses:template.recipients,resultingRecipients:D.recipients(t.text)});
  template.recipients='LATER CHANGE';assert.equal(D.fields(t.text).to,'EXACT ADDRESS');assert.ok(t.recipientSnapshots[0].sourceAddresses.includes('EXACT ADDRESS'));
});
console.log(passed+' document/workflow tests passed.');
