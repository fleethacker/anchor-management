const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),context=vm.createContext({TextEncoder});
for(const id of ['casrep-document-model','casrep-reporting-model','casrep-routing-queue'])vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))[1],context);
const now='2026-11-05T12:00:00Z';
const record=(id,extra={})=>({id,number:id,title:'QA cooling pump',equipment:'QA pump',caseStatus:'Active',stage:'In review',category:'C3',messageType:'INITIAL',submittedAt:'2026-10-26T12:00:00Z',reviews:[{id:'divo',label:'Division Officer · QA Reviewer',status:'Pending'}],...extra});
const build=(rows,filters={})=>JSON.parse(JSON.stringify(context.CasrepRoutingQueue.build(rows,filters,now)));
test('queue includes only active pre-transmission reports and never mutates records',()=>{
 const rows=[record('draft',{stage:'Draft'}),record('review'),record('release',{stage:'Ready for release'}),record('authorized',{stage:'Release authorized'}),record('closed',{caseStatus:'Corrected'}),record('sent',{stage:'Transmitted'}),record('delivered',{stage:'Delivery verified'}),record('unknown',{stage:'Unknown'})];
 const original=JSON.stringify(rows),result=build(rows);
 assert.equal(result.total,4);assert.deepEqual(result.counts,{'Draft':1,'In review':1,'Ready for release':1,'Release authorized':1});assert.equal(JSON.stringify(rows),original);
});
test('search/category/reviewer filters combine and stage counts cover matches before the stage selection',()=>{
 const rows=[record('r1'),record('r2',{stage:'Draft'}),record('r3',{category:'C4'}),record('r4',{title:'QA radar',equipment:'Radar'})];
 const result=build(rows,{routeSearch:' PUMP ',routeCategory:'C3',routeStage:'Draft'});
 assert.deepEqual(result.rows.map(r=>r.id),['r2']);assert.equal(result.counts['In review'],1);assert.equal(result.counts.Draft,1);assert.equal(result.matching,2);assert.equal(result.total,4);
 assert.deepEqual(build(rows,{routeOwner:'Division Officer',routeSearch:'r1'}).rows.map(r=>r.id),['r1']);
 assert.deepEqual(build(rows,{routeOwner:'Division Officer · QA Reviewer',routeCategory:'C4'}).rows.map(r=>r.id),['r3']);
 assert.equal(build(rows,{routeSearch:'no match'}).rows.length,0);
});
test('reporting urgency orders overdue deadlines before changes, due dates and unsubmitted drafts',()=>{
 const rows=[record('draft',{stage:'Draft',submittedAt:''}),record('scheduled',{submittedAt:'2026-11-01T12:00:00Z'}),record('due'),record('late',{submittedAt:'2026-10-25T12:00:00Z'}),record('oldest-late',{submittedAt:'2026-10-24T12:00:00Z'}),record('changed',{submittedAt:'2026-11-01T12:00:00Z',reporting:{pendingChanges:[{at:'2026-11-02T12:00:00Z',reason:'QA parts change'}]}})];
 assert.deepEqual(build(rows).rows.map(r=>r.id),['oldest-late','late','changed','due','scheduled','draft']);
});
test('recorded update sorting keeps undated reports last and category sorting puts C4 first',()=>{
 const rows=[record('b',{updatedAt:'2026-11-04T12:00:00Z',category:'C4'}),record('a',{updatedAt:'2026-11-02T12:00:00Z'}),record('c',{createdAt:'2026-11-03T12:00:00Z',category:'C2'}),record('missing',{updatedAt:'invalid',category:'C2'})];
 assert.deepEqual(build(rows,{routeSort:'oldest'}).rows.map(r=>r.id),['a','c','b','missing']);assert.deepEqual(build(rows,{routeSort:'newest'}).rows.map(r=>r.id),['b','c','a','missing']);assert.deepEqual(build(rows,{routeSort:'category'}).rows.map(r=>r.id),['b','a','c','missing']);
});
test('next action follows the first pending saved reviewer and release stages',()=>{
 const owner=context.CasrepRoutingQueue.owner;
 assert.equal(owner(record('r',{reviews:[{label:'Division Officer',status:'Concurred'},{label:'Department Head · QA Reviewer',status:'Pending'}]})),'Department Head · QA Reviewer');
 assert.equal(owner(record('r',{stage:'Ready for release'})),'CO release');assert.equal(owner(record('r',{stage:'Release authorized'})),'Message transmission');
});
