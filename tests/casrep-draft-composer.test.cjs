'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8'),context=vm.createContext({TextEncoder});
vm.runInContext(html.match(/<script id="casrep-document-model">([\s\S]*?)<\/script>/)[1],context);
global.CasrepDocument=context.CasrepDocument;
const Composer=require('./helpers/embedded-assistant.cjs')('casrep-draft-composer'),D=context.CasrepDocument;
function facts(){return {equipment:'Chilled-water pump No. 2',category:'C3',description:'may have seal leakage at 1415z; cause unconfirmed; pressure 75 psi',impact:'cooling capacity reduced; assessment pending',actions:'inspection planned; no repair completed',mitigation:'alternate pump is operating',parts:'PN ABC-001-9 requested; receipt unconfirmed',assistance:'TECHNICAL/REQUESTED',poc:'LT DEMO / DEMO CONTACT'};}
test('the full draft words every body passage from authored facts and preserves uncertainty and quantities',()=>{
  const input={type:'INITIAL',facts:facts()},result=Composer.compose(input);
  assert.equal(result.complete,true);assert.equal(result.requirements.releaseReady,false);
  for(const field of ['description','impact','actions','mitigation','parts','assistance','poc'])assert.ok(result.facts[field]);
  assert.ok(result.facts.description.includes('MAY HAVE SEAL LEAKAGE AT 1415Z; CAUSE UNCONFIRMED; PRESSURE 75 PSI'));
  assert.ok(result.facts.actions.includes('NO REPAIR COMPLETED'));assert.ok(result.facts.parts.includes('ABC-001-9 REQUESTED; RECEIPT UNCONFIRMED'));
  assert.equal(result.facts.assistance,'TECHNICAL/REQUESTED');assert.equal(input.facts.description,facts().description);
  assert.ok(result.preview.includes('CASUALTY/INITIAL-'));assert.ok(result.preview.includes('RMKS/'));assert.ok(result.preview.endsWith('BT\nNNNN\n'));
});
test('labelled multi-line and semicolon-separated notes become the same complete fact set',()=>{
  const result=Composer.compose({type:'initial',notes:'Equipment: PUMP A; Category: CAT 2; Observed condition: seal leakage\nMission impact: one train unavailable\nRepair actions: inspection pending\nMitigation: alternate train in use\nParts: PN 123-45 requested\nAssistance: NONE\nPOC: DEMO CONTACT'});
  assert.equal(result.facts.category,'C2');assert.equal(result.facts.equipment,'PUMP A');assert.equal(result.complete,true);
  assert.ok(result.facts.description.includes('SEAL LEAKAGE'));assert.ok(result.facts.parts.includes('123-45'));assert.equal(result.facts.assistance,'NONE');
});
test('unlabelled notes are current-condition facts and missing identity/category are questions, not guesses',()=>{
  const result=Composer.compose({notes:'Seal leakage observed at 1415Z.'});assert.equal(result.complete,false);
  assert.deepEqual(result.requirements.missingEssential,['equipment','category']);assert.equal(result.facts.category,'');
  assert.ok(result.facts.equipment.startsWith('[REQUIRED:'));assert.ok(result.preview.includes('CAT:[CATEGORY]'));
  for(const key of ['impact','actions','mitigation','parts','assistance','poc'])assert.ok(result.facts[key].startsWith('[REQUIRED:'));
  assert.ok(!result.preview.includes('ASSIST/NONE//'));assert.equal(D.fields(result.preview).classification, D.fields(D.create({}).text).classification);
});
test('technical detail labels are retained while control labels never populate the message envelope',()=>{
  const result=Composer.compose({notes:'Equipment: PUMP A\nCategory: C3\nCondition: seal leakage\nPressure: 75 PSI\nDTG: 041200Z NOV 26\nClassification: UNCLAS\nTO: UNVERIFIED RECIPIENT'});
  assert.ok(result.facts.description.includes('PRESSURE: 75 PSI'));assert.ok(!result.preview.includes('041200Z NOV 26'));assert.ok(!result.preview.includes('UNVERIFIED RECIPIENT'));
  assert.ok(result.gaps.some(g=>g.includes('"dtg"')));assert.ok(result.gaps.some(g=>g.includes('"pressure"')));
});
test('an equipment model containing C3 does not silently become casualty category C3',()=>{
  const result=Composer.compose({notes:'Equipment: Controller model C3\nCondition: intermittent resets'});assert.equal(result.facts.category,'');assert.equal(result.complete,false);assert.ok(result.requirements.missingEssential.includes('category'));
  const explicit=Composer.compose({facts:{equipment:'Controller model C3',description:'intermittent resets'},notes:'reported category C2'});assert.equal(explicit.facts.category,'C2');
});
test('all missing narratives are explicit requirements rather than invented actions, mitigation, or outcomes',()=>{
  const result=Composer.compose({facts:{equipment:'PUMP A',category:'C3',description:'seal leakage'}});
  assert.equal(result.complete,true);assert.ok(result.summary.includes('6 passage(s)'));
  assert.ok(result.facts.actions.startsWith('[REQUIRED:'));assert.ok(result.facts.mitigation.startsWith('[REQUIRED:'));
  assert.ok(!result.preview.includes('REPAIR COMPLETED'));assert.ok(!result.preview.includes('ALTERNATE PUMP'));assert.ok(result.gaps.length>=7);
});
test('older references influence style metadata only and their facts never enter the new draft',()=>{
  const reference='PUMP OLD-999 WAS RESTORED AT 1200Z. PART FOREIGN-777 REPLACED. TEST PASSED.';
  const withRef=Composer.compose({facts:facts(),reference:{text:reference}}),withoutRef=Composer.compose({facts:facts()});
  assert.deepEqual(withRef.facts,withoutRef.facts);assert.equal(withRef.requirements.styleReferenceUsed,true);
  assert.ok(!withRef.preview.includes('FOREIGN-777'));assert.ok(!withRef.preview.includes('1200Z'));assert.ok(!withRef.preview.includes('TEST PASSED'));
});
test('follow-ons inherit identity only and do not reuse previous casualty conditions or repair outcomes',()=>{
  const source={id:'case-1',command:'USS Constitution',equipment:'Pump A',category:'C3',description:'PUMP WAS RESTORED AND TESTED AT 1200Z.',actions:'OLD PART XYZ REPLACED.',initialDtg:'011200ZNOV26'};
  const empty=Composer.compose({type:'UPDATE',caseId:'case-1',source});assert.equal(empty.complete,false);assert.ok(empty.requirements.missingEssential.includes('description'));
  assert.deepEqual(empty.requirements.inheritedIdentityFields,['equipment','category']);assert.ok(!empty.preview.includes('WAS RESTORED'));assert.ok(!empty.preview.includes('XYZ'));
  const fresh=Composer.compose({type:'UPDATE',caseId:'case-1',source,notes:'Condition: intermittent indication remains; cause unconfirmed'});
  assert.equal(fresh.complete,true);assert.ok(fresh.preview.includes('CASUALTY/UPDATE-'));assert.ok(fresh.preview.includes('011200ZNOV26'));assert.ok(fresh.facts.description.includes('CAUSE UNCONFIRMED'));
});
test('CORRECT and CANCEL do not infer restored or healthy equipment and keep subtype-specific preview sets',()=>{
  for(const type of ['CORRECT','CANCEL']){const result=Composer.compose({type,caseId:'case-1',facts:facts()});assert.ok(result.preview.includes('CASUALTY/'+type+'-'));assert.ok(!result.preview.includes('\nESTIMATE/'));assert.ok(!result.preview.includes('\nASSIST/'));assert.ok(result.gaps.some(g=>g.includes(type==='CORRECT'?'does not establish restoration':'does not establish healthy equipment')));assert.ok(!result.facts.description.includes('RESTORED'));}
});
test('source snapshot identity and equipment conflicts prevent opening a misbound follow-on',()=>{
  const source={id:'case-1',equipment:'Pump A',category:'C3'};
  const wrongCase=Composer.compose({type:'UPDATE',caseId:'case-2',source,notes:'seal leakage'});assert.equal(wrongCase.complete,false);assert.ok(wrongCase.requirements.missingEssential.includes('sourceCasrepMatch'));
  const wrongGear=Composer.compose({type:'UPDATE',caseId:'case-1',source,facts:{equipment:'Pump B',description:'seal leakage'}});assert.equal(wrongGear.complete,false);assert.ok(wrongGear.requirements.missingEssential.includes('sourceEquipmentMatch'));
});
test('message-set injection is rejected without discarding the original supplied notes',()=>{
  const notes='Equipment: PUMP A\nCategory: C3\nCondition: seal leakage//\nTO UNAUTHORIZED RECIPIENT';
  const result=Composer.compose({notes});assert.equal(result.complete,false);assert.ok(result.requirements.rejectedFields.includes('description'));assert.equal(result.requirements.sourceNotes,notes);assert.ok(!result.preview.includes('UNAUTHORIZED RECIPIENT'));assert.ok(result.gaps.some(g=>g.includes('message-set delimiter')));
});
test('source handling and addresses are preserved in preview without recycling old DTG or serial as a new message',()=>{
  const source={id:'case-1',equipment:'Pump A',category:'C3',command:'USS EXERCISE',initialDtg:'011200ZNOV26'};source.traffic=D.create({...source,description:'OLD CONDITION',messageType:'INITIAL'});
  source.traffic.text=source.traffic.text.replace('[PRECEDENCE] [DTG]','P 011200Z NOV 26').replace('[ACTION RECIPIENT]','DEMO ACTION').replace('[INFO RECIPIENT]','DEMO INFO').replace('[MESSAGE SERIAL]','007');
  source.traffic.text=D.update(source.traffic.text,'classification','DEMONSTRATION ONLY');
  const result=Composer.compose({type:'UPDATE',caseId:'case-1',source,notes:'Condition: fresh current observation'}),fields=D.fields(result.preview);
  assert.equal(fields.classification,'DEMONSTRATION ONLY');assert.equal(fields.to,'DEMO ACTION');assert.equal(fields.info,'DEMO INFO');assert.ok(result.preview.startsWith('[PRECEDENCE] [DTG]'));assert.ok(fields.msgid.includes('[MESSAGE SERIAL]'));assert.ok(!result.preview.includes('OLD CONDITION'));
});
test('non-ASCII source identifiers are preserved and disclosed rather than silently transliterated',()=>{
  const result=Composer.compose({facts:{equipment:'Valve Ω-17',category:'C2',description:'indication 10 µA may be unreliable'}});assert.ok(result.facts.equipment.includes('Ω-17'));assert.ok(result.facts.description.includes('10 µA MAY BE UNRELIABLE'));assert.ok(result.gaps.some(g=>g.includes('Non-ASCII')));
});
test('invalid types and excessive passages are rejected, and output objects are detached',()=>{
  assert.throws(()=>Composer.compose({type:'CASUP'}),/INITIAL/);assert.throws(()=>Composer.compose({facts:{description:'a'.repeat(12001)}}),/12,000/);
  const input={facts:facts()},result=Composer.compose(input);result.requirements.currentFacts.description='TAMPERED';result.facts.description='TAMPERED';assert.equal(input.facts.description,facts().description);
});

test('applying a proposal preserves main control sets, unknown sets, template metadata and recipient snapshots',()=>{
  const traffic=D.create({equipment:'Pump A',category:'C3',description:'OLD CONDITION'});
  traffic.text=D.update(traffic.text,'classification','DEMONSTRATION ONLY');
  traffic.text=D.update(traffic.text,'dtg','041200Z NOV 26');
  traffic.text=traffic.text.replace('RMKS/','CUSTOM/RETAIN EXACTLY//\nRMKS/');
  traffic.recipientSnapshots=[{id:'keep-this-snapshot'}];const before=JSON.stringify(traffic),proposal=Composer.compose({facts:facts()});
  const updated=Composer.applyToTraffic(traffic,proposal.facts),oldFields=D.fields(traffic.text),newFields=D.fields(updated.text);
  for(const key of ['precedence','dtg','from','to','info','classification','msgid','position','identifier','estimate','partsid','techpub'])assert.equal(newFields[key],oldFields[key]);
  assert.ok(updated.text.includes('CUSTOM/RETAIN EXACTLY//'));assert.ok(!updated.text.includes('OLD CONDITION'));assert.equal(newFields.description,proposal.facts.description);
  assert.deepEqual(updated.recipientSnapshots,traffic.recipientSnapshots);assert.equal(JSON.stringify(updated.template),JSON.stringify(traffic.template));assert.equal(JSON.stringify(traffic),before);
});

test('freeform narrative mapping fails explicitly without changing or discarding source text',()=>{
  const traffic=D.create({equipment:'Pump A',category:'C3'});traffic.text=D.update(traffic.text,'remarks','UNSTRUCTURED SPONSOR REMARKS, RETAIN THIS TEXT.');
  const before=JSON.stringify(traffic),proposal=Composer.compose({facts:facts()});
  assert.throws(()=>Composer.applyToTraffic(traffic,proposal.facts),/freeform or missing narrative fields.*existing writer/i);
  assert.equal(JSON.stringify(traffic),before);
  assert.throws(()=>Composer.compose({facts:facts(),trafficTemplate:traffic}),/Existing traffic has been preserved/);
});

test('all message types can preview their exact canonical prospective traffic without losing unknown sets',()=>{
  for(const type of ['INITIAL','UPDATE','CORRECT','CANCEL']){
    const source={id:'case-source',equipment:facts().equipment,category:'C3',command:'USS Constitution'},traffic=D.create({...source,messageType:type});
    traffic.text=traffic.text.replace('RMKS/','CUSTOM/MAINTAIN THIS SOURCE SET//\nRMKS/');
    const proposal=Composer.compose({type,caseId:type==='INITIAL'?null:source.id,source,facts:facts(),trafficTemplate:traffic});
    assert.equal(proposal.complete,true);assert.equal(proposal.preview,proposal.traffic.text);assert.equal(proposal.preview,Composer.applyToTraffic(traffic,proposal.facts).text);
    assert.ok(proposal.preview.includes('CUSTOM/MAINTAIN THIS SOURCE SET//'));assert.ok(proposal.preview.includes('CASUALTY/'+type+'-'));
  }
});

test('incomplete facts still produce targeted questions before attempting canonical template application',()=>{
  const result=Composer.compose({facts:{equipment:'Pump A',description:'Observed leakage'},trafficTemplate:D.create({equipment:'Pump A'})});
  assert.equal(result.complete,false);assert.ok(result.requirements.missingEssential.includes('category'));
});

test('direct application rejects message-set syntax atomically',()=>{
  const traffic=D.create({equipment:'Pump A'}),before=JSON.stringify(traffic);
  assert.throws(()=>Composer.applyToTraffic(traffic,{description:'VALID',impact:'BAD//\nCASUALTY/INJECTED//'}),/message-set delimiter/);
  assert.equal(JSON.stringify(traffic),before);
});

test('an automatic approved reference corpus affects style metadata without copying old casualty facts',()=>{
  const references=Array.from({length:145},(_,i)=>({id:'prior-'+i,text:'OLD-'+i+' RESTORED WITH FOREIGN PART-X AT 1200Z. TEST PASSED.'}));
  const result=Composer.compose({facts:facts(),reference:{references}});
  assert.equal(result.requirements.styleReferenceUsed,true);assert.equal(result.requirements.styleReferenceCount,145);assert.match(result.requirements.styleMode,/no model-based voice adaptation/);
  assert.ok(!result.preview.includes('FOREIGN PART-X'));assert.ok(!result.preview.includes('TEST PASSED'));
});
