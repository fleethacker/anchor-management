const {test,expect}=require('@playwright/test');

test('focused Assistant history uses the server model and reports connection status',async({page})=>{
  let requests=0;
  await page.route('**/api/v1/assistant/capabilities',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{localAvailable:true,modelConfigured:true,modelAvailable:true,provider:'local-model',authenticationRequired:false,authenticated:true}})}));
  await page.route('**/api/v1/assistant/responses',async route=>{
    requests++;
    const payload=route.request().postDataJSON();
    expect(payload.mode).toBe('chat');
    expect(payload.task).toBe('history');
    expect(payload.question).toBe('Summarize this fictional case.');
    expect(payload.caseIds).toEqual(['demo-rich-1002']);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{mode:'chat',provider:'local-model',answer:'Server model response for the fictional workspace.',claims:[],gaps:[],warnings:[],coverage:'isolated browser test',requestId:'test-request',skill:'casrep-assistant-page-v1'}})});
  });
  await page.goto('/#casrep/demo-rich-1002');
  await page.locator('#casrep-assistant-button').click();
  await expect(page.locator('.ca-chat-heading>small')).toHaveText('Model ready · local-model');
  await page.locator('#ca-chat-input').fill('Summarize this fictional case.');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.locator('.ca-answer')).toContainText('Model-assisted Assistant response');
  await expect(page.locator('.ca-answer')).toContainText('Server model response for the fictional workspace.');
  await expect(page.locator('.ca-answer-kicker')).toHaveText('MODEL RESPONSE');
  await expect(page.locator('.ca-answer')).toContainText('Request: test-request');
  await expect(page.locator('.ca-chat-heading>small')).toHaveText('Model connected · local-model');
  expect(requests).toBe(1);
});

test('oversized scope explains recovery and a selected case can use inference',async({page})=>{
  const writes=[],requests=[];
  page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v1/')&&!r.url().endsWith('/assistant/responses'))writes.push(r.url());});
  await page.route('**/api/v1/assistant/capabilities',route=>route.fulfill({json:{data:{modelAvailable:true,authenticated:true,provider:'local-model'}}}));
  await page.route('**/api/v1/assistant/responses',route=>{
    const payload=route.request().postDataJSON();requests.push(payload);
    if(payload.caseIds.length!==1)return route.fulfill({status:422,json:{error:{message:'invalid assistant request: local Assistant scope is too large; narrow the selection'}}});
    expect(payload.caseIds).toEqual(['demo-rich-1008']);
    return route.fulfill({json:{data:{mode:'chat',provider:'local-model',answer:'A controller reset was reported.',claims:[{text:'Controller reset under load.',sourceIds:['demo-rich-1008']}],coverage:'Resolved 1 case(s)',requestId:'scope-retry'}}});
  });
  await page.goto('/#assistant');
  await expect(page.getByLabel('History scope')).toBeVisible();
  const before=await page.evaluate(()=>JSON.stringify(ReadinessApp.store.all()));
  await page.locator('#ca-chat-input').fill('Summarize the CASREP history.');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.locator('.ca-chat-notice')).toContainText('scope is too large');
  await expect(page.locator('.ca-chat-heading>small')).toHaveText('Model ready · narrow scope');
  await page.getByLabel('History scope').selectOption('demo-rich-1008');
  await page.getByRole('button',{name:'Retry response',exact:true}).last().click();
  await expect(page.locator('.ca-answer').last()).toContainText('A controller reset was reported.');
  await expect(page.locator('.ca-answer-scope').last()).toContainText('selected CASREP');
  await expect(page.locator('.ca-answer-kicker').last()).toHaveText('MODEL RESPONSE');
  await expect(page.locator('.ca-chat-heading>small')).toHaveText('Model connected · local-model');
  await page.setViewportSize({width:400,height:900});
  await expect(page.getByLabel('History scope')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(await page.evaluate(()=>JSON.stringify(ReadinessApp.store.all()))).toBe(before);
  expect(requests).toHaveLength(2);expect(writes).toEqual([]);
});

test('failed inference stays distinct from a ready model and retains retry',async({page})=>{
  await page.route('**/api/v1/assistant/capabilities',route=>route.fulfill({json:{data:{modelAvailable:true,authenticated:true,provider:'local-model'}}}));
  await page.route('**/api/v1/assistant/responses',route=>route.fulfill({status:503,json:{error:{message:'Assistant model did not return a usable response'}}}));
  await page.goto('/#casrep/demo-rich-1008');await page.locator('#casrep-assistant-button').click();
  await expect(page.getByLabel('History scope')).toBeVisible();
  await page.locator('#ca-chat-input').fill('Summarize this case.');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.locator('.ca-chat-heading>small')).toHaveText('Model error · local-only fallback');
  await expect(page.locator('.ca-chat-notice')).toContainText('did not return a usable response');
  await expect(page.locator('.ca-answer-kicker')).toHaveText('LOCAL COMPARISON');
  await expect(page.getByRole('button',{name:'Retry response',exact:true})).toBeVisible();
});

test('new chat, device history, rename, copy, delete and undo preserve CASREP state',async({page})=>{
  const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v1/'))writes.push(r.url());});
  await page.goto('/#assistant');await expect(page.locator('#ca-chat-input')).toBeVisible();
  const before=await page.evaluate(()=>JSON.stringify(ReadinessApp.store.all()));
  await page.locator('#ca-chat-input').fill('Compare systems');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.locator('.ca-answer')).toBeVisible();
  await page.locator('[data-ca-new-chat]').click();await expect(page.getByRole('heading',{name:'What would you like to do?'})).toBeVisible();await expect(page.locator('.ca-answer')).toHaveCount(0);
  await page.locator('[data-ca-history]').click();await expect(page.locator('.ca-history-open').filter({hasText:'Compare systems'})).toBeVisible();
  await page.locator('[data-ca-rename-chat]').first().click();await page.locator('.ca-history-rename input').fill('Engineering review');await page.getByRole('button',{name:'Save name',exact:true}).click();
  await page.locator('.ca-history-open').filter({hasText:'Engineering review'}).click();await expect(page.locator('.ca-answer')).toBeVisible();
  await page.reload();await expect(page.locator('#ca-chat-input')).toBeVisible();await page.locator('[data-ca-history]').click();await page.locator('.ca-history-open').filter({hasText:'Engineering review'}).click();await expect(page.locator('.ca-answer')).toBeVisible();
  await page.locator('[data-ca-copy-message]').last().click();await expect(page.locator('.ca-chat-notice')).toContainText(/Copied|Clipboard/);
  await page.locator('[data-ca-history]').click();await page.locator('[data-ca-delete-chat]').first().click();await expect(page.locator('.ca-chat-notice')).toContainText('deleted');
  await page.locator('[data-ca-undo-chat]').click();await expect(page.locator('.ca-history-open').filter({hasText:'Engineering review'})).toBeVisible();
  expect(await page.evaluate(()=>JSON.stringify(ReadinessApp.store.all()))).toBe(before);expect(writes).toEqual([]);expect(errors).toEqual([]);
});

test('new chats leave an unsaved writer buffer intact and settings remain accessible',async({page},testInfo)=>{
  await page.goto('/');await page.getByRole('button',{name:'New CASREP',exact:true}).click();await page.locator('#editor-field-equipment').fill('UNSAVED EXERCISE EQUIPMENT');const draft=await page.locator('#editor-message').inputValue();
  await page.locator('#casrep-assistant-button').click();await page.locator('[data-ca-new-chat]').click();await page.locator('#ca-chat-input').fill('Find repeat equipment');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.locator('.ca-answer')).toBeVisible();
  await page.locator('[data-ca-options]').first().click();await page.locator('[data-ca-settings]').click();await expect(page.locator('#ca-enter-send')).toBeVisible();await page.locator('#ca-enter-send').uncheck();
  await page.locator('[data-ca-options]').last().click();await page.locator('[data-ca-close]').click();await expect(page.locator('#editor-message')).toHaveValue(draft);
  await page.locator('#casrep-assistant-button').click();await page.setViewportSize({width:400,height:900});await expect(page.locator('[data-ca-new-chat]')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);const composer=await page.locator('.ca-chat-composer').boundingBox();expect(composer.y+composer.height).toBeLessThanOrEqual(900);await page.screenshot({path:testInfo.outputPath('chat-controls-phone.png')});
});
