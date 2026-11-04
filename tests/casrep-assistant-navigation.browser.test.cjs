'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CASREP_TEST_URL||'http://127.0.0.1:4173/';
let passed=0;const errors=[];
const check=label=>{passed++;console.log('PASS '+label);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
 async function fresh(width=1440,hash='',setup){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());if(setup)await page.addInitScript(setup);
  await page.goto(base+hash);await page.locator('#casrep-assistant-button:not([disabled])').waitFor();return{context,page};
 }
 try {
  for(const dirty of [false,true]){
   const {context,page}=await fresh();
   if(dirty)await page.evaluate(()=>{window.ReadinessApp.openRecord(null);});
   else await page.evaluate(()=>{const r=window.ReadinessApp.store.all().find(r=>r.stage==='Draft'&&r.caseStatus==='Active');window.ReadinessApp.openRecord(r.id);});
   await page.locator('#editor-message').waitFor();
   if(dirty){const current=await page.locator('#editor-message').inputValue();await page.locator('#editor-message').fill(current.replace('IMPACT:','IMPACT: EXACT UNSAVED MARKER '));}
   const value=await page.locator('#editor-message').inputValue(),route=new URL(page.url()).hash;
   await page.locator('#casrep-assistant-button').click();await page.locator('#ca-chat-input').waitFor();
   await page.goBack();await page.locator('#editor-message').waitFor();assert.equal(new URL(page.url()).hash,route);assert.equal(await page.locator('#editor-message').inputValue(),value);assert.equal(await page.locator('#app').evaluate(el=>el.classList.contains('assistant-page-active')),false);
   await page.goForward();await page.locator('#ca-chat-input').waitFor();assert.equal(new URL(page.url()).hash,'#assistant');
   await page.goBack();await page.locator('#editor-message').waitFor();assert.equal(await page.locator('#editor-message').inputValue(),value);
   check((dirty?'Dirty unsaved New CASREP':'Saved CASREP')+' survives browser Back/Forward from Assistant');await context.close();
  }
  for(const width of [641,768,900,390]){
   const {context,page}=await fresh(width);if(width===390){await page.locator('#menu-toggle').click();await page.waitForFunction(()=>document.querySelector('#casrep-assistant-button').getBoundingClientRect().x>=0);}
   const button=page.locator('#casrep-assistant-button');assert.equal(await button.isVisible(),true);const box=await button.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,'Launcher must be in viewport at '+width);
   await button.click();await page.locator('#ca-chat-input').waitFor();assert.equal(await page.locator('#ca-chat-title').isVisible(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   check('Assistant launcher opens chat at '+width+'px'+(width===390?' with navigation expanded':''));await context.close();
  }
  {
   const {context,page}=await fresh(1440,'',()=>{let core;Object.defineProperty(window,'CasrepCore',{configurable:true,get:()=>core,set:value=>{core=Object.assign({},value,{createStore:function(storage){const store=value.createStore(storage);if(storage)return store;return Object.assign({},store,{transition:function(id,action,payload){if(action!=='followup')return store.transition(id,action,payload);return new Promise((resolve,reject)=>{window.rejectPortalHandoff=()=>reject(new Error('Delayed source conflict'));});}});}});}});});
   await page.locator('#casrep-assistant-button').click();await page.locator('[data-ca-task="UPDATE"]').click();await page.locator('#ca-chat-source').waitFor();
   const sourceId=await page.locator('#ca-chat-source option').evaluateAll(options=>options.find(option=>option.value).value);await page.locator('#ca-chat-source').selectOption(sourceId);await page.locator('[data-ca-use-source]').click();
   await page.locator('#ca-chat-input').fill('Condition: Recorded degradation remains under investigation.');await page.locator('.ca-chat-composer button[type="submit"]').click();await page.locator('[data-ca-open-draft]').waitFor();await page.locator('[data-ca-open-draft]').click();
   await page.waitForFunction(()=>typeof window.rejectPortalHandoff==='function');assert.equal(await page.locator('[data-ca-close]').isDisabled(),true);await page.locator('[data-ca-close]').evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(await page.locator('#ca-chat-title').isVisible(),true);
   await page.goBack();await page.waitForURL('**/#assistant');assert.equal(await page.locator('#ca-chat-title').isVisible(),true);
   await page.evaluate(()=>window.rejectPortalHandoff());await page.locator('.ca-chat-notice').filter({hasText:'Delayed source conflict'}).waitFor();assert.equal(await page.locator('#ca-chat-title').isVisible(),true);assert.equal(await page.locator('[data-ca-close]').isDisabled(),false);assert.equal(await page.locator('[data-ca-open-draft]').count(),1);
   check('Pending rejected follow-on keeps chat and proposal through Back attempts');await context.close();
  }
  {
   const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/api/v1/health**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Configured backend unavailable'}})}));
   await page.goto(base+'?api='+encodeURIComponent(base+'api/v1'));await page.getByRole('heading',{name:'Workspace could not load'}).waitFor();assert.equal(await page.locator('#casrep-assistant-button').isDisabled(),true);assert.equal(await page.evaluate(()=>Object.keys(localStorage).includes(window.CasrepCore.storageKey)),false);
   check('Configured API 503 remains fail-closed with disabled launcher and no local fallback');await context.close();
  }
  assert.deepEqual(errors,[]);console.log(passed+' portal regression groups passed; no page errors.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
