const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const renderSource=html.slice(html.indexOf('  function editorShipSchedule(){'),html.indexOf('  function editorView(){'));
const DocContext=vm.createContext({TextEncoder});
vm.runInContext(html.match(/<script id="casrep-document-model">([\s\S]*?)<\/script>/)[1],DocContext);
const Doc=DocContext.CasrepDocument;

function render(shared,saved,locked){
  const traffic=Doc.create({title:'FICTIONAL SCHEDULE TEST'});
  if(saved){const at=Doc.ranges(traffic.text).remarks.end;traffic.text=traffic.text.slice(0,at)+'\nSCHEDULE: '+saved+traffic.text.slice(at);}
  const original=traffic.text;
  const context=vm.createContext({shipSchedule:shared?{text:shared}:null,Doc,editorSession:()=>({traffic}),editableEditor:()=>!locked,esc:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))});
  vm.runInContext(renderSource,context);
  const output=context.editorShipSchedule();
  assert.equal(traffic.text,original,'displaying the shared schedule must not rewrite the message');
  return output;
}

test('a shared schedule is visible before saving a new draft',()=>{
  const output=render('05 NOV: DEMO PIER\n10 NOV: DEMO UNDERWAY','',false);
  assert.match(output,/05 NOV: DEMO PIER\n10 NOV: DEMO UNDERWAY/);
  assert.match(output,/included when this draft is saved/);
  assert.match(output,/Manage schedule/);
});
test('a locked message distinguishes its saved schedule from the current command schedule',()=>{
  const output=render('CURRENT FICTIONAL SCHEDULE','PREVIOUS FICTIONAL SCHEDULE',true);
  assert.match(output,/Current command schedule/);
  assert.match(output,/This locked report retains its saved message/);
  assert.match(output,/<summary>Schedule in this message<\/summary>/);
  assert.match(output,/PREVIOUS FICTIONAL SCHEDULE/);
});
test('a locked message without a schedule does not imply that it includes the shared value',()=>{
  assert.match(render('CURRENT FICTIONAL SCHEDULE','',true),/No schedule recorded in this message/);
});
test('an existing message schedule remains readable when no shared schedule is configured',()=>{
  const output=render('','SAVED FICTIONAL SCHEDULE',true);
  assert.match(output,/SAVED FICTIONAL SCHEDULE/);
  assert.match(output,/Schedule recorded in this message/);
});
test('empty schedules and literal HTML are presented safely',()=>{
  assert.match(render('','',false),/No shared schedule set/);
  const output=render('<img src=x onerror=alert(1)>','',false);
  assert.doesNotMatch(output,/<img/);
  assert.match(output,/&lt;img/);
});
