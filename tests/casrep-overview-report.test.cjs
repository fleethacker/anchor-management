const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const context=vm.createContext({TextEncoder});
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const id of ['casrep-document-model','casrep-reporting-model','casrep-overview-report-model'])vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],context);
const build=context.CasrepOverviewReport.build;
const now='2026-11-04T12:00:00Z';
function report(id,fields={}){return {id,number:id,title:'Casualty '+id,command:'Test ship',caseStatus:'Active',stage:'In review',messageType:'INITIAL',category:'C3',submittedAt:'2026-11-04T10:00:00Z',reviews:[{id:'cheng',label:'CHENG',status:'Pending'}],...fields};}
test('brief uses all active records, prioritizes CAT 4 and keeps omissions explicit',()=>{
 const records=Array.from({length:12},(_,i)=>report('c'+i,{category:i===11?'C4':i===10?'C2':'C3'}));
 records.push(report('closed',{caseStatus:'Corrected'}));
 const before=JSON.stringify(records),b=build(records,{now});
 assert.equal(b.total,12);assert.equal(b.categories.C4,1);assert.equal(b.categories.C3,10);assert.equal(b.categories.C2,1);
 assert.equal(b.priorities.length,8);assert.equal(b.omitted,4);assert.equal(b.priorities[0].id,'c11');assert.equal(JSON.stringify(records),before);
});
test('deadline watch counts preserve due-today changes and do not invent missing dates',()=>{
 const b=build([report('late',{category:'C4',submittedAt:'2026-10-30T10:00:00Z',etr:'2026-11-03T10:00:00Z'}),report('today',{category:'C4',submittedAt:'2026-11-01T10:00:00Z',materialChanges:[{at:now,kind:'parts',detail:'Parts received'}]}),report('missing',{submittedAt:''})],{now});
 assert.equal(b.overdue,1);assert.equal(b.dueToday,1);assert.equal(b.changes,1);assert.equal(b.missingSubmission,1);assert.equal(b.lateRepair,1);assert.equal(b.missingEtr,2);
});
test('material and review totals use linked records and preserve the shared schedule',()=>{
 const b=build([report('one',{assetId:'pump',reviews:[{id:'divo',label:'DIVO',status:'Concurred'},{id:'cheng',label:'CHENG · Smith',status:'Pending'}]})],{now,schedule:'04 NOV: In port\n10 NOV: Underway',workOrders:[{assetId:'pump',status:'Open'},{assetId:'other',status:'Open'}],requisitions:[{casrepId:'one',status:'In transit'},{assetId:'pump',status:'Received'},{assetId:'other',status:'Ordered'}]});
 assert.equal(b.openWork,1);assert.equal(b.openRequisitions,1);assert.equal(b.receivedRequisitions,1);assert.equal(b.owners[0].label,'CHENG · Smith');assert.match(b.schedule,/\n10 NOV/);
 assert.equal(build([],{now}).priorities.length,0);
});
