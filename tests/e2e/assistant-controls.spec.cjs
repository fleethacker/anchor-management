const {test,expect}=require('@playwright/test');

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
