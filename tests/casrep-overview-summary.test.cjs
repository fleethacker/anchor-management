const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),context=vm.createContext({TextEncoder});
for(const id of ['casrep-document-model','casrep-reporting-model','casrep-overview-summary'])vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))[1],context);
const build=(rows,at='2026-11-05T12:00:00Z')=>JSON.parse(JSON.stringify(context.CasrepOverviewSummary.build(rows,at)));
const report=(id,more={})=>({id,number:id,command:'QA SHIP',profile:'FLEET',caseStatus:'Active',stage:'Transmitted',messageType:'INITIAL',category:'C3',submittedAt:'2026-10-26T12:00:00Z',etr:'2026-12-01T12:00:00Z',...more});
test('unique casualties retain closure drafts until reporting is closed and preserve ship scope',()=>{
 const rows=[report('a',{number:'26001',revision:1}),report('b',{number:'26001',revision:2,messageType:'CORRECT',stage:'Draft'}),report('c',{number:'26001',command:'QA OTHER'}),report('d',{number:'26002',caseStatus:'Corrected'})],before=JSON.stringify(rows),summary=build(rows);
 assert.equal(summary.active.length,2);assert.equal(summary.duplicateRows,1);assert.equal(summary.active.find(r=>r.number==='26001'&&r.command==='QA SHIP').id,'b');assert.equal(JSON.stringify(rows),before);
});
test('calendar counts use UTC dates and forward week/month windows',()=>{
 const summary=build([report('today'),report('late',{submittedAt:'2026-10-25T12:00:00Z'}),report('sunday',{submittedAt:'2026-10-29T12:00:00Z'}),report('monday',{submittedAt:'2026-10-30T12:00:00Z'}),report('missing',{submittedAt:''})]);
 assert.deepEqual(summary.periods.today,['today']);assert.deepEqual(summary.periods.week,['today','sunday']);assert.deepEqual(summary.periods.month,['today','sunday','monday']);assert.equal(summary.overdue,1);assert.equal(summary.withoutDeadline,1);
});
test('a deadline earlier today remains due today after its clock time passes',()=>{
 const summary=build([report('early',{etr:'2026-11-06T00:01:00Z'})],'2026-11-05T23:59:00Z');assert.deepEqual(summary.periods.today,['early']);assert.equal(summary.overdue,0);
});
