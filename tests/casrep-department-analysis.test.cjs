'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('./helpers/embedded-assistant.cjs')('casrep-department-analysis');
function asset(id='a',extra={}){return Object.assign({id,name:'Pump '+id,command:'SHIP A',profile:'FLEET',system:'Cooling'},extra);}
function casualty(id='c',extra={}){return Object.assign({id,number:'CASREP '+id,title:'Recorded cooling condition',assetId:'a',equipment:'Pump a',system:'Cooling',command:'SHIP A',profile:'FLEET',caseStatus:'Active',category:'C3',stage:'Draft',messageType:'INITIAL',revision:1,description:'Leak observed; cause uncertain.',impact:'Redundancy reduced.',actions:'Inspection planned.',failureStatus:'Reported',failureEvidence:'',partNumber:'PN-1',partName:'Seal',partFailureStatus:'Suspected',partFailureEvidence:'',rootCauseStatus:'Unknown',rootCause:'',discoveredAt:'2026-10-01T12:00:00Z',traffic:{text:'FICTIONAL CURRENT CASREP '+id},versions:[],degradationEvents:[]},extra);}
const dep=(s,id='engineering')=>s.departments.find(d=>d.id===id);
const system=s=>dep(s).systems.find(s=>s.name==='Cooling');
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}
function result(s,findings=[]){return {schemaVersion:M.schemaVersion,snapshotId:s.snapshotId,reviewedCaseIds:s.allCaseIds.slice(),summary:'Recorded evidence requires technical review.',findings,limitations:['Operating exposure is not available.']};}
function finding(s,overrides={}){const d=dep(s),sys=d.systems[0];return Object.assign({id:'lead-1',departmentId:d.id,systemId:sys.id,priority:'Investigate',title:'Review the recorded leak',observation:'A leak is recorded.',rationale:'Compare inspection evidence before diagnosing a cause.',evidenceCaseIds:sys.caseIds.slice(),alternativeExplanations:['Different conditions may explain similar symptoms.'],recommendedChecks:['Review the inspection and test records.'],missingData:['Operating hours.']},overrides);}

test('the opening hierarchy always has the exact four departments and honest empty measures',()=>{
  const s=M.analyze({cases:[],assets:[]});assert.deepEqual(s.departments.map(d=>d.name),['Combat Systems','Engineering','Deck','Supply']);
  assert.ok(s.departments.every(d=>d.metrics.caseCount===0&&d.metrics.confirmedFailureShare.percent===null));assert.equal(s.coverage.reviewedAllLoadedRows,true);assert.equal(s.coverage.sourceComplete,false);
});
test('the entire supplied dataset is analyzed beyond page and legacy AI packet limits',()=>{
  const rows=Array.from({length:1205},(_,i)=>casualty('c'+i));const s=M.analyze({cases:rows,assets:[asset()]},{sourceComplete:true});assert.equal(s.coverage.loadedCaseCount,1205);assert.equal(s.coverage.analyzedCaseCount,1205);assert.equal(dep(s).metrics.caseCount,1205);assert.equal(s.caseIds.length,1205);assert.equal(M.createAnalysisPacket(s,'Review all').reviewManifest.length,1205);
});
test('categories count active cases while historical cases remain in event and confirmation totals',()=>{
  const rows=[casualty('a',{failureStatus:'Confirmed',failureEvidence:'Inspection confirmed leakage.'}),casualty('b',{caseStatus:'Corrected',category:'C4',failureStatus:'Confirmed',failureEvidence:'Historical inspection.'}),casualty('c',{category:'C2'})];const s=M.analyze({cases:rows,assets:[asset()]});const m=dep(s).metrics;assert.equal(m.caseCount,3);assert.equal(m.activeCases,2);assert.deepEqual(m.categories,{C2:1,C3:1,C4:0});assert.equal(m.confirmedFailureCases,2);assert.deepEqual(m.confirmedFailureShare,{numerator:2,denominator:3,percent:200/3});
});
test('suspected, requested, root-cause and unsupported confirmation flags do not become confirmed part failures',()=>{
  const rows=[casualty('a',{partFailureStatus:'Confirmed',partFailureEvidence:''}),casualty('b',{parts:'Replacement seal requested',rootCauseStatus:'Confirmed',rootCause:'Cooling interruption'}),casualty('c',{partFailureStatus:'Confirmed',partFailureEvidence:'Removed seal failed inspection.'})];const s=M.analyze({cases:rows,assets:[asset()]});const p=system(s).parts[0];assert.equal(p.confirmedFailureCount,1);assert.deepEqual(p.confirmedCaseIds,['c']);assert.deepEqual(p.suspectedCaseIds,['b']);assert.equal(p.reportedCaseCount,3);assert.equal(dep(s).metrics.confirmedPartFailureCases,1);
});
test('stable physical identities, not names, govern recurrence and no-history equipment',()=>{
  const rows=[casualty('a'),casualty('b'),casualty('c',{assetId:'other',equipment:'Pump a'})],assets=[asset(),asset('other',{name:'Pump a'}),asset('zero')];const s=M.analyze({cases:rows,assets});assert.equal(dep(s).metrics.repeatedAssets,1);assert.equal(dep(s).metrics.noHistoryAssets,1);assert.equal(system(s).equipment.find(e=>e.assetId==='zero').noRecordedHistory,true);assert.deepEqual(dep(s).metrics.repeatCaseShare,{numerator:1,denominator:3,percent:100/3});
});
test('unverified asset links and matching equipment names never create repeat-asset findings',()=>{
  const rows=[casualty('a',{assetId:''}),casualty('b',{assetId:'missing'})];const s=M.analyze({cases:rows,assets:[asset()]});assert.equal(dep(s).metrics.repeatedAssets,0);assert.equal(dep(s).metrics.affectedAssets,0);assert.equal(dep(s).metrics.repeatCaseShare.percent,null);assert.deepEqual(s.coverage.unlinkedCaseIds,['a','b']);assert.ok(system(s).equipment.filter(e=>!e.registered).every(e=>!e.repeatHistory));
});
test('asset identities remain separated across commands and profiles',()=>{
  const rows=[casualty('a'),casualty('b',{command:'SHIP B'}),casualty('c',{profile:'TRAINING'})];const assets=[asset(),asset('a',{command:'SHIP B'}),asset('a',{profile:'TRAINING'})];const s=M.analyze({cases:rows,assets});assert.equal(dep(s).metrics.repeatedAssets,0);assert.equal(dep(s).systems.length,3);assert.equal(new Set(dep(s).systems.map(x=>x.id)).size,3);assert.equal(dep(s).metrics.affectedAssets,3);
});
test('all rows and canonical narratives remain in inventory before presentation filters',()=>{
  const rows=[casualty('fleet'),casualty('training',{profile:'TRAINING',caseStatus:'Cancelled'})];const s=M.analyze({cases:rows,assets:[asset(),asset('a',{profile:'TRAINING'})]},{profile:'FLEET'});assert.deepEqual(s.allCaseIds,['fleet','training']);assert.deepEqual(s.caseIds,['fleet']);assert.equal(s.caseEvidence.training.inScope,false);assert.match(M.createAnalysisPacket(s,'All history').caseEvidence.training.traffic,/training/);assert.equal(s.coverage.outOfScopeCaseCount,1);
});
test('identical duplicate rows count once; conflicting IDs and missing IDs are explicitly quarantined',()=>{
  const a=casualty('a'),b=casualty('b');const s=M.analyze({cases:[a,JSON.parse(JSON.stringify(a)),b,casualty('b',{description:'Different source'}),{system:'Cooling'}],assets:[asset()]});assert.equal(s.coverage.loadedCaseCount,5);assert.equal(s.coverage.uniqueCaseCount,2);assert.equal(s.coverage.analyzedCaseCount,1);assert.equal(dep(s).metrics.caseCount,1);assert.deepEqual(s.coverage.caseDuplicateIds,['a','b']);assert.deepEqual(s.coverage.caseConflictingIds,['b']);assert.deepEqual(s.coverage.caseMissingIdRows,[4]);assert.deepEqual(s.coverage.currentNarrativeMissingCaseIds,['b']);assert.equal(s.caseEvidence.b,undefined);
});
test('unknown or conflicting ownership is visible outside the four rollups without forced assignment',()=>{
  const rows=[casualty('nav',{system:'Navigation'}),casualty('conflict',{department:'Deck'})];const s=M.analyze({cases:rows,assets:[asset('a',{department:'Engineering'})]});assert.deepEqual(s.unassigned.caseIds,['conflict']);assert.equal(s.caseEvidence.nav.departmentId,'engineering');const unknown=M.analyze({cases:[casualty('nav',{system:'Navigation',assetId:''})],assets:[]});assert.deepEqual(unknown.unassigned.caseIds,['nav']);assert.equal(unknown.departments.reduce((n,d)=>n+d.metrics.caseCount,0),0);
});
test('configured ownership overrides suggestions and explicit conflicts are never silently remapped',()=>{
  const s=M.analyze({cases:[casualty('a',{system:'Navigation',assetId:''}),casualty('b',{department:'Supply'})],assets:[]},{systemDepartments:{Navigation:'Deck'}});assert.equal(dep(s,'deck').metrics.caseCount,1);assert.equal(dep(s,'supply').metrics.caseCount,1);assert.equal(s.caseEvidence.a.ownership.inferred,false);const inferred=M.analyze({cases:[casualty()],assets:[asset()]});assert.equal(inferred.caseEvidence.c.ownership.inferred,true);assert.deepEqual(inferred.coverage.inferredDepartmentCaseIds,['c']);
});
test('mapping review remains required for unmapped or conflicting ownership even without inferred mappings',()=>{
  const known=casualty('known',{department:'Engineering',assetId:''}),unknown=casualty('unknown',{system:'Navigation',assetId:''});
  const s=M.analyze({cases:[known,unknown],assets:[]});assert.deepEqual(s.coverage.inferredDepartmentCaseIds,[]);assert.deepEqual(s.unassigned.caseIds,['unknown']);assert.equal(s.coverage.mappingRequiresReview,true);assert.equal(M.analyze({cases:[known],assets:[]}).coverage.mappingRequiresReview,false);
  const conflict=M.analyze({cases:[casualty('conflict',{department:'Deck'})],assets:[asset('a',{department:'Engineering'})]});assert.deepEqual(conflict.coverage.inferredDepartmentCaseIds,[]);assert.equal(conflict.coverage.mappingRequiresReview,true);
  const unknownAsset=M.analyze({cases:[known],assets:[asset('nav',{system:'Navigation'})]});assert.equal(unknownAsset.coverage.mappingRequiresReview,true);
});
test('message updates, retransmissions and degradation observations do not inflate casualty counts',()=>{
  const r=casualty('c',{messageType:'UPDATE',revision:2,stage:'Delivery verified',versions:[{revision:1,type:'INITIAL',authorizedAt:'2026-09-01'},{revision:2,type:'UPDATE',authorizedAt:'2026-09-02'},{revision:2,type:'UPDATE',authorizedAt:'2026-09-02'},{revision:3,type:'UPDATE'},{revision:4,type:'CORRECT',authorizedAt:'2026-09-03'}],transmissions:[{id:'send1'},{id:'send2'}],degradationEvents:[{id:'d1',kind:'Degradation',detail:'Pressure reduced.'},{id:'d1',kind:'Degradation',detail:'Pressure reduced.'},{id:'f1',kind:'Failure',evidence:'Test result'}]});const s=M.analyze({cases:[r],assets:[asset()]});const m=dep(s).metrics;assert.equal(m.caseCount,1);assert.equal(m.followOnMessages,2);assert.equal(m.degradationObservations,1);assert.equal(m.failureObservations,1);assert.equal(m.repeatedAssets,0);
});
test('history preserves canonical revisions, actual root-cause fields, tests, repair and material context',()=>{
  const r=casualty('c',{rootCauseStatus:'Suspected',rootCause:'Seal damage remains unconfirmed.',restoredAt:'2026-10-02',testEvidence:'Post-repair pressure test recorded.',versions:[{revision:1,type:'INITIAL',authorizedAt:'2026-10-01',record:{traffic:{text:'OLDER APPROVED MESSAGE'},description:'Prior condition'}},{revision:2,type:'UPDATE',record:{description:'No canonical text'}}],degradationEvents:[{id:'d',at:'2026-10-01T13:00:00Z',kind:'Degradation',detail:'Pressure reduced.'}]});
  const s=M.analyze({cases:[r],assets:[asset()],workOrders:[{id:'wo',assetId:'a',title:'Inspect seal',status:'Open'}],requisitions:[{id:'req',assetId:'a',part:'Seal',status:'Ordered'}]});const e=s.caseEvidence.c;assert.equal(e.history.findings.rootCause,r.rootCause);assert.equal(e.history.versions[0].record.traffic.text,'OLDER APPROVED MESSAGE');assert.equal(e.history.maintenance.workOrders[0].id,'wo');assert.equal(e.history.material.requisitions[0].id,'req');assert.deepEqual(e.history.tests,['Post-repair pressure test recorded.']);assert.equal(e.timeline.filter(t=>t.kind==='Casualty').length,1);assert.equal(e.historicalNarrativeMissingCount,1);assert.equal(s.coverage.historicalNarrativeMissingCount,1);
});
test('ambiguous support-resource links cannot leak across commands sharing an asset ID',()=>{
  const s=M.analyze({cases:[casualty('a'),casualty('b',{command:'SHIP B'})],assets:[asset(),asset('a',{command:'SHIP B'})],workOrders:[{id:'ambiguous',assetId:'a',title:'Unassigned work'},{id:'known',assetId:'a',command:'SHIP A',title:'Known work'}],requisitions:[{id:'material',assetId:'a',command:'SHIP B',part:'Seal'}]});assert.deepEqual(s.coverage.unlinkedWorkOrderIds,['ambiguous']);assert.deepEqual(s.caseEvidence.a.history.maintenance.workOrders.map(w=>w.id),['known']);assert.deepEqual(s.caseEvidence.b.history.maintenance.workOrders,[]);assert.deepEqual(s.caseEvidence.a.history.material.requisitions,[]);assert.equal(s.caseEvidence.b.history.material.requisitions[0].id,'material');
});
test('conflicting registry copies cannot create stable asset identity or reliable denominators',()=>{
  const s=M.analyze({cases:[casualty('a'),casualty('b')],assets:[asset(),asset('a',{name:'A different physical identity'})]});assert.equal(s.coverage.assetConflictingIds.length,1);assert.equal(dep(s).metrics.registeredAssets,0);assert.equal(dep(s).metrics.repeatedAssets,0);assert.equal(s.coverage.unlinkedCaseIds.length,2);
});
test('snapshot identity ignores collection order but changes when narrative, history or support evidence changes',()=>{
  const input={cases:[casualty('a'),casualty('b')],assets:[asset(),asset('z')],workOrders:[{id:'wo',assetId:'a',title:'Inspect'}]};const a=M.analyze(input),b=M.analyze({...input,cases:input.cases.slice().reverse(),assets:input.assets.slice().reverse()});assert.equal(a.snapshotId,b.snapshotId);const changed=JSON.parse(JSON.stringify(input));changed.cases[0].actions='Different repair evidence';assert.notEqual(M.analyze(changed).snapshotId,a.snapshotId);changed.cases[0]=input.cases[0];changed.workOrders[0].title='Different work';assert.notEqual(M.analyze(changed).snapshotId,a.snapshotId);
});
test('analysis is read-only with frozen inputs and returned values do not mutate later analyses',()=>{
  const input=freeze({cases:[casualty('a')],assets:[asset()],workOrders:[],requisitions:[]}),before=JSON.stringify(input),s=M.analyze(input);assert.equal(JSON.stringify(input),before);s.departments[0].name='Changed';s.caseEvidence.a.history.impact.description='Changed';assert.equal(M.analyze(input).departments[0].name,'Combat Systems');assert.equal(M.analyze(input).caseEvidence.a.history.impact.description,input.cases[0].description);
});
test('canonical narrative availability is explicit and structured-only rows cannot imply complete reading',()=>{
  const s=M.analyze({cases:[casualty('a',{traffic:null}),casualty('b')],assets:[asset()]});assert.equal(s.coverage.currentNarrativeAvailableCount,1);assert.deepEqual(s.coverage.currentNarrativeMissingCaseIds,['a']);assert.equal(s.caseEvidence.a.currentNarrativeAvailable,false);assert.ok(s.caseEvidence.a.dataGaps.some(g=>g.includes('canonical')));const r=result(s);r.limitations=[];assert.equal(M.validateAgentResult(r,s).valid,false);
});
test('valid annotation results retain deterministic totals and detach from the source result',()=>{
  const s=M.analyze({cases:[casualty('a')],assets:[asset()]}),r=result(s,[finding(s)]),before=JSON.stringify(s);const validated=M.validateAgentResult(r,s);assert.equal(validated.valid,true);assert.equal(JSON.stringify(s),before);validated.value.summary='Changed';assert.notEqual(r.summary,'Changed');
});
test('agent results reject partial coverage, duplicate review acknowledgments, stale snapshots and aggregate replacement',()=>{
  const s=M.analyze({cases:[casualty('a'),casualty('b',{profile:'TRAINING'})],assets:[asset()]},{profile:'FLEET'});const partial=result(s);partial.reviewedCaseIds=['a'];assert.equal(M.validateAgentResult(partial,s).valid,false);const duplicate=result(s);duplicate.reviewedCaseIds.push('a');assert.equal(M.validateAgentResult(duplicate,s).valid,false);const stale=result(s);stale.snapshotId='old';assert.equal(M.validateAgentResult(stale,s).valid,false);const forged=result(s);forged.departments=[];assert.equal(M.validateAgentResult(forged,s).valid,false);
});
test('citations must belong to the selected department, system, equipment and part',()=>{
  const s=M.analyze({cases:[casualty('a'),casualty('b',{assetId:'other',partNumber:'PN-2'}),casualty('combat',{system:'Combat systems',assetId:''})],assets:[asset(),asset('other')]}),sys=system(s),p=sys.parts.find(p=>p.number==='PN-1');assert.equal(M.validateAgentResult(result(s,[finding(s,{partId:p.id,evidenceCaseIds:['b']})]),s).valid,false);assert.equal(M.validateAgentResult(result(s,[finding(s,{evidenceCaseIds:['combat']})]),s).valid,false);assert.equal(M.validateAgentResult(result(s,[finding(s,{evidenceCaseIds:['unknown']})]),s).valid,false);assert.equal(M.validateAgentResult(result(s,[finding(s,{partId:p.id,evidenceCaseIds:['a']})]),s).valid,true);
});
test('annotation result bounds and alternatives are enforced without inventing confidence values',()=>{
  const s=M.analyze({cases:[casualty('a')],assets:[asset()]});assert.equal(M.validateAgentResult(result(s,[finding(s,{confidence:0.99})]),s).valid,false);assert.equal(M.validateAgentResult(result(s,[finding(s,{alternativeExplanations:[]})]),s).valid,false);const tooLong=result(s);tooLong.summary='x'.repeat(12001);assert.equal(M.validateAgentResult(tooLong,s).valid,false);
});
test('IDs that resemble object prototype names stay ordinary data',()=>{
  const s=M.analyze({cases:[casualty('__proto__')],assets:[asset()]});assert.equal(s.caseEvidence.__proto__.id,'__proto__');assert.equal(Object.prototype.id,undefined);assert.equal(dep(s).metrics.caseCount,1);
});
test('conflicted or unidentified source cases never become a zero-history claim for linked equipment',()=>{
  const s=M.analyze({cases:[casualty('conflict'),casualty('conflict',{description:'Conflicting source text'}),casualty('',{assetId:'other'})],assets:[asset(),asset('other'),asset('zero')]});assert.equal(dep(s).metrics.caseCount,0);assert.equal(dep(s).metrics.noHistoryAssets,1);const eq=system(s).equipment;assert.equal(eq.find(e=>e.assetId==='a').historyCoverageUnknown,true);assert.equal(eq.find(e=>e.assetId==='a').noRecordedHistory,false);assert.equal(eq.find(e=>e.assetId==='other').noRecordedHistory,false);assert.equal(eq.find(e=>e.assetId==='zero').noRecordedHistory,true);assert.ok(eq.every(e=>!e.repeatHistory));
});
test('malformed optional version rows are retained as missing narrative evidence rather than crashing analysis',()=>{
  const s=M.analyze({cases:[casualty('a',{versions:[null,{revision:1,type:'UPDATE'}]})],assets:[asset()]});assert.equal(s.coverage.historyVersionCount,2);assert.equal(s.coverage.historicalNarrativeMissingCount,2);assert.equal(s.caseEvidence.a.history.versions.length,2);
});
test('invalid registry rows and missing source identities are disclosed without invented IDs',()=>{
  const s=M.analyze({cases:[{assetId:'a',system:'Cooling'}],assets:[null,{name:'No ID'},asset('a',{profile:''})]});assert.deepEqual(s.coverage.caseMissingIdRows,[0]);assert.deepEqual(s.coverage.assetMissingIdRows,[0,1]);assert.deepEqual(s.coverage.unverifiedAssetRows,[0,1,2]);assert.deepEqual(s.allCaseIds,[]);assert.equal(dep(s).metrics.caseCount,0);
});

test('custom areas follow the four defaults, bind snapshots and retain evidence',()=>{
 const input={cases:[casualty('custom')],assets:[asset()]},options={areas:[{id:'custom-navigation',name:'Navigation'}],caseDepartments:{custom:'custom-navigation'}};
 const snapshot=M.analyze(input,options),custom=snapshot.departments[4];assert.deepEqual(snapshot.departments.slice(0,4).map(d=>d.name),['Combat Systems','Engineering','Deck','Supply']);assert.equal(custom.name,'Navigation');assert.equal(custom.metrics.caseCount,1);assert.equal(snapshot.caseEvidence.custom.ownership.inferred,false);assert.notEqual(snapshot.snapshotId,M.analyze(input).snapshotId);
 const output=result(snapshot,[{...finding(M.analyze(input)),departmentId:custom.id,systemId:custom.systems[0].id,evidenceCaseIds:['custom']}]);assert.equal(M.validateAgentResult(output,snapshot).valid,true);
 assert.throws(()=>M.analyze(input,{areas:[{id:'deck',name:'Other'}]}),/unique/);assert.throws(()=>M.analyze(input,{areas:[{id:'custom-one',name:'Engineering'}]}),/unique/);
});
