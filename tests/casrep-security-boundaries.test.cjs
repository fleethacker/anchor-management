const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function store(random,adapter){const context=vm.createContext({TextEncoder,crypto:random});for(const id of ['casrep-demo-catalog','casrep-aegis-model','casrep-aegis-demo','casrep-document-model','casrep-reporting-model','casrep-data-model'])vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))[1],context);return context.CasrepCore.createStore(adapter);}
test('case and observation IDs use secure randomness when UUID convenience is unavailable',()=>{
 const current=store({getRandomValues:crypto.webcrypto.getRandomValues.bind(crypto.webcrypto)}),record=current.upsert({title:'QA secure identifier',equipment:'QA Pump',assetId:'qa-pump'});
 assert.match(record.id,/^case-[0-9a-f]{32}$/);
 const observed=current.addEquipmentObservation(record.id,{kind:'Degradation',symptom:'QA vibration',detail:'QA recorded symptom',at:new Date().toISOString()});assert.match(observed.degradationEvents[0].id,/^observation-[0-9a-f]{32}$/);assert.notEqual(record.id.slice(5),observed.degradationEvents[0].id.slice(12));
});
test('missing secure randomness leaves persisted storage unchanged',()=>{const saved=new Map(),adapter={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},current=store(undefined,adapter),before=JSON.stringify(Array.from(saved));assert.throws(()=>current.upsert({title:'QA blocked identifier',equipment:'QA Pump'}),/Secure record identifiers/);assert.ok(JSON.stringify(Array.from(saved))===before,'persisted records changed after unavailable randomness');});
