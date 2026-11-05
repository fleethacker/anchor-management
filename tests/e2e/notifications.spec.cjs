const {test,expect}=require('@playwright/test');

const staticHealth=route=>route.fulfill({status:404,contentType:'application/json',body:'{}'});
const activeRows=page=>page.locator('.notification-active .notification-row');
const dismissButtons=page=>page.locator('.notification-active [data-action="notification-dismiss"]');

async function openNotifications(page){
  await expect(page.getByRole('heading',{name:'CASREP overview',exact:true})).toBeVisible();
  await page.locator('#reporting-notifications').click();
  await expect(page.getByRole('dialog',{name:'CASREP update notifications',exact:true})).toBeVisible();
}

async function expectedNotifications(page){
  return page.evaluate(()=>{
    const records=ReadinessApp.store.all().filter(r=>ReadinessApp.state.profile==='all'||r.profile===ReadinessApp.state.profile);
    const missing=records.filter(r=>CasrepReporting.resolve(r).status==='missing');
    return {count:CasrepReporting.attention(records).length+missing.length,missing:missing.map(r=>r.id)};
  });
}

for(const mode of ['backend','static']){
  test(`${mode}: notifications can be dismissed, cleared and restored without changing CASREPs`,async({page})=>{
    const writes=[];
    page.on('request',request=>{if(request.url().includes('/api/v1/')&&!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+request.url());});
    if(mode==='static')await page.route('**/api/v1/health',staticHealth);
    await page.goto('/#overview');
    await expect(page.getByRole('heading',{name:'CASREP overview',exact:true})).toBeVisible();
    // Static hydration supplies legacy optional defaults; establish that baseline before the actions.
    if(mode==='static'){await page.reload();await expect(page.getByRole('heading',{name:'CASREP overview',exact:true})).toBeVisible();}
    const expected=await expectedNotifications(page);
    expect(expected.count).toBeGreaterThan(1);
    expect(expected.missing.length).toBeGreaterThan(0);
    const original=await page.evaluate(()=>ReadinessApp.store.all());
    await expect(page.locator('#reporting-notifications .notification-count')).toHaveText(String(expected.count));
    await openNotifications(page);
    await expect(activeRows(page)).toHaveCount(expected.count);
    // Missing submission evidence is a dismissible notification and part of the badge.
    for(const id of expected.missing)await expect(page.locator('.notification-active [data-action="notification-dismiss"][data-id="'+id+'"]')).toHaveCount(1);
    const firstId=await dismissButtons(page).first().getAttribute('data-id');
    const nextId=await dismissButtons(page).nth(1).getAttribute('data-id');
    await dismissButtons(page).first().press('Enter');
    await expect(activeRows(page)).toHaveCount(expected.count-1);
    await expect(page.locator('[data-action="notification-dismiss"][data-id="'+nextId+'"]')).toBeFocused();
    await expect(page.locator('#reporting-notifications .notification-count')).toHaveText(String(expected.count-1));
    await page.reload();
    await openNotifications(page);
    await expect(activeRows(page)).toHaveCount(expected.count-1);
    await expect(page.locator('.notification-active [data-action="notification-dismiss"][data-id="'+firstId+'"]')).toHaveCount(0);
    await expect(page.locator('.notification-dismissed summary')).toHaveText('Dismissed (1)');
    await page.getByRole('button',{name:'Clear all',exact:true}).press('Enter');
    await expect(activeRows(page)).toHaveCount(0);
    await expect(page.locator('#notifications-empty')).toContainText('No new notifications.');
    await expect(page.locator('#notifications-empty')).toBeFocused();
    await expect(page.locator('#reporting-notifications .notification-count')).toHaveCount(0);
    expect(await page.evaluate(()=>ReadinessApp.store.all())).toEqual(original);
    await page.reload();
    await openNotifications(page);
    await expect(activeRows(page)).toHaveCount(0);
    await expect(page.locator('#notifications-empty')).toBeFocused();
    await expect(page.locator('.notification-dismissed summary')).toHaveText('Dismissed ('+expected.count+')');
    if(mode==='static'){
      // The same origin can serve static fixtures and a backend; preferences must not leak between them.
      await page.unroute('**/api/v1/health',staticHealth);
      await page.reload();
      await openNotifications(page);
      await expect(activeRows(page)).toHaveCount((await expectedNotifications(page)).count);
      await page.route('**/api/v1/health',staticHealth);
      await page.reload();
      await openNotifications(page);
      await expect(activeRows(page)).toHaveCount(0);
    }
    await page.locator('.notification-dismissed summary').click();
    await page.locator('[data-action="notification-restore"][data-id="'+firstId+'"]').click();
    await expect(activeRows(page)).toHaveCount(1);
    await expect(page.locator('#reporting-notifications .notification-count')).toHaveText('1');
    const dismissed=page.locator('.notification-dismissed');
    await expect(dismissed).toHaveAttribute('open','');
    await page.getByRole('button',{name:'Restore all',exact:true}).click();
    await expect(activeRows(page)).toHaveCount(expected.count);
    expect(await page.evaluate(()=>ReadinessApp.store.all())).toEqual(original);
    expect(writes).toEqual([]);
    await page.locator('.notification-active [data-open="'+firstId+'"]').click();
    await expect(page.getByRole('heading',{name:'CASREP editor',exact:true})).toBeVisible();
    await expect(page).toHaveURL(new RegExp('#casrep/'+firstId+'$'));
  });
}

test('a newly recorded material change resurfaces a cleared overdue alert, while a later overdue day does not',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
  await page.route('**/api/v1/health',staticHealth);
  await page.goto('/#overview');
  await expect(page.getByRole('heading',{name:'CASREP overview',exact:true})).toBeVisible();
  const chosen=await page.evaluate(()=>{
    const row=CasrepReporting.attention(ReadinessApp.store.all().filter(r=>r.profile==='FLEET')).find(i=>i.schedule.status==='overdue');
    return {id:row.record.id,dueAt:row.schedule.dueAt,text:row.record.traffic.text,revision:row.record.revision};
  });
  await openNotifications(page);
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  // Test-only input through the actual model command; dismissing must not acknowledge this change.
  await page.evaluate(id=>{ReadinessApp.store.requireUpdate(id,{kind:'notification-regression',detail:'EXERCISE ONLY: new parts information after clearing an alert.'});ReadinessApp.render();},chosen.id);
  await openNotifications(page);
  await expect(activeRows(page)).toHaveCount(1);
  await expect(page.locator('.notification-active [data-open="'+chosen.id+'"]')).toHaveCount(1);
  // A new condition arriving while the dialog has focus was not part of the rendered clear action.
  await page.evaluate(id=>ReadinessApp.store.requireUpdate(id,{kind:'notification-regression-later',detail:'EXERCISE ONLY: another change arrived while reading notifications.'}),chosen.id);
  await page.getByRole('button',{name:'Clear all',exact:true}).press('Enter');
  await expect(activeRows(page)).toHaveCount(1);
  await expect(page.locator('.notification-active [data-action="notification-dismiss"][data-id="'+chosen.id+'"]')).toBeFocused();
  await dismissButtons(page).press('Enter');
  await expect(page.locator('#notifications-empty')).toBeFocused();
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
  await page.reload();
  await openNotifications(page);
  await expect(page.locator('.notification-active [data-action="notification-dismiss"][data-id="'+chosen.id+'"]')).toHaveCount(0);
  const after=await page.evaluate(id=>{const r=ReadinessApp.store.get(id);return {dueAt:CasrepReporting.resolve(r).dueAt,text:r.traffic.text,revision:r.revision,pending:r.reporting.pendingChanges};},chosen.id);
  expect(after.dueAt).toBe(chosen.dueAt);
  expect(after.text).toBe(chosen.text);
  expect(after.revision).toBe(chosen.revision);
  expect(after.pending.some(c=>c.kind==='notification-regression')).toBe(true);
});

test('notification controls fit a phone, work in dark mode and retain keyboard focus after the final dismissal',async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/v1/health',staticHealth);
  await page.goto('/#overview');
  await page.locator('#appearance-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await openNotifications(page);
  for(const size of [{width:1440,height:1000},{width:390,height:844}]){
    await page.setViewportSize(size);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const fits=await page.locator('#notification-list').evaluate(el=>el.scrollWidth<=el.clientWidth+1);
    expect(fits).toBe(true);
    await expect(page.getByRole('button',{name:'Clear all',exact:true})).toBeInViewport();
    const openBounds=await page.locator('.notification-active [data-open]').first().boundingBox();
    const dismissBounds=await dismissButtons(page).first().boundingBox();
    expect(openBounds.x+openBounds.width).toBeLessThanOrEqual(dismissBounds.x+1);
    await page.screenshot({path:info.outputPath('notifications-dark-'+size.width+'.png'),animations:'disabled'});
  }
  await page.getByRole('button',{name:'Clear all',exact:true}).press('Enter');
  await expect(page.locator('#notifications-empty')).toBeFocused();
  await page.locator('.notification-dismissed summary').click();
  await page.locator('[data-action="notification-restore"]').first().click();
  await expect(activeRows(page)).toHaveCount(1);
  await dismissButtons(page).press('Enter');
  await expect(page.locator('#notifications-empty')).toBeFocused();
  await page.locator('#notifications-empty').press('Escape');
  await expect(page.getByRole('dialog',{name:'CASREP update notifications',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
});
