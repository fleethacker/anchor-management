const {test,expect}=require('@playwright/test');

for(const mode of ['backend','static']){
 test(`${mode}: compact queue filters, pages and returns to the selected report without workflow writes`,async({page})=>{
  if(mode==='static')await page.route('**/api/v1/health',r=>r.fulfill({status:404,body:'{}'}));
  const writes=[];page.on('request',r=>{if(r.url().includes('/api/v1/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.method()+' '+r.url());});
  await page.goto('/#routing');await expect(page.locator('.queue-list')).toBeVisible();await expect(page.locator('[data-queue-layout="list"]')).toHaveAttribute('aria-pressed','true');
  const original=await page.evaluate(()=>JSON.stringify(ReadinessApp.store.all()));
  const firstPage=await page.locator('.queue-list tbody tr').evaluateAll(rows=>rows.map(r=>r.dataset.queueId));expect(firstPage).toHaveLength(15);
  await page.getByRole('button',{name:'Next',exact:true}).first().click();await expect(page.locator('.queue-pagination').first()).toContainText('16–');
  const secondPage=await page.locator('.queue-list tbody tr').evaluateAll(rows=>rows.map(r=>r.dataset.queueId));expect(secondPage.some(id=>firstPage.includes(id))).toBe(false);
  await page.getByRole('combobox',{name:'Category',exact:true}).selectOption('C3');await expect(page.locator('.queue-list tbody tr').first()).toBeVisible();
  expect(await page.locator('.queue-list tbody td[data-label="Category"] .badge').allTextContents()).toEqual(expect.arrayContaining(['C3']));
  expect((await page.locator('.queue-list tbody td[data-label="Category"] .badge').allTextContents()).every(v=>v==='C3')).toBe(true);
  await page.getByRole('combobox',{name:'Next action with',exact:true}).selectOption('Message transmission');
  const releaseTab=page.locator('[data-queue-stage="Release authorized"]');const matching=await releaseTab.locator('span').textContent();expect(Number(matching)).toBeGreaterThan(0);
  await page.locator('[data-queue-stage="In review"]').click();await expect(page.getByRole('heading',{name:'No reports match this view'})).toBeVisible();await expect(releaseTab.locator('span')).toHaveText(matching);
  await releaseTab.click();await expect(page.locator('.queue-list tbody tr')).toHaveCount(Number(matching));
  await page.getByRole('combobox',{name:'Sort by',exact:true}).selectOption('oldest');
  const chosen=page.locator('.queue-list tbody tr').first(),id=await chosen.getAttribute('data-queue-id');
  await chosen.focus();await chosen.press('Enter');await expect(page.locator('#editor-message')).toBeVisible();await expect(page.getByRole('button',{name:'Back to routing queue',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to routing queue',exact:true}).click();await expect(page).toHaveURL(/#routing$/);await expect(page.getByRole('combobox',{name:'Category',exact:true})).toHaveValue('C3');await expect(page.getByRole('combobox',{name:'Next action with',exact:true})).toHaveValue('Message transmission');await expect(page.getByRole('combobox',{name:'Sort by',exact:true})).toHaveValue('oldest');await expect(releaseTab).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-queue-id="'+id+'"]')).toBeFocused();
  await page.locator('[data-queue-id="'+id+'"] .cell-link').click();await expect(page.locator('#editor-message')).toBeVisible();await page.goBack();await expect(page).toHaveURL(/#routing$/);await expect(page.locator('[data-queue-id="'+id+'"]')).toBeFocused();
  await page.getByRole('button',{name:'Clear',exact:true}).click();await page.getByLabel('Search reports',{exact:true}).fill('no report matches this');await expect(page.getByRole('heading',{name:'No reports match this view'})).toBeVisible();await expect(page.getByLabel('Search reports',{exact:true})).toBeFocused();await page.getByLabel('Search reports',{exact:true}).fill('DEMO-26-005');await expect(page.locator('.queue-list tbody tr')).toHaveCount(1);
  await page.locator('[data-queue-layout="board"]').click();await expect(page.locator('.queue-board .routing-column')).toHaveCount(1);await expect(page.locator('.route-card')).toHaveCount(1);await expect(page.locator('.route-card')).toContainText('DEMO-26-005');
  await page.locator('[data-queue-layout="list"]').click();await expect(page.locator('.queue-list tbody tr')).toHaveCount(1);
  expect(await page.evaluate(()=>JSON.stringify(ReadinessApp.store.all()))).toBe(original);expect(writes).toEqual([]);
 });
}

test('queue keeps page and scroll after opening a report, and registry opens keep their own back link',async({page})=>{
 await page.route('**/api/v1/health',r=>r.fulfill({status:404,body:'{}'}));await page.goto('/#routing');
 // Add only fictional locked reports to this isolated browser's local fixture.
 await page.evaluate(()=>{
  const key=CasrepCore.storageKey,stored=JSON.parse(localStorage.getItem(key)),template=stored.cases.find(r=>r.id==='demo-005');
  for(let i=0;i<35;i++)stored.cases.push({...template,id:'qa-queue-'+i,number:'QA-QUEUE-'+i,title:'EXERCISE queue pagination '+i});
  localStorage.setItem(key,JSON.stringify(stored));
 });
 await page.reload();await expect(page.locator('.queue-list')).toBeVisible();await page.getByRole('combobox',{name:'Next action with',exact:true}).selectOption('Message transmission');await page.getByRole('button',{name:'Next',exact:true}).first().click();
 const row=page.locator('.queue-list tbody tr').nth(10),id=await row.getAttribute('data-queue-id');await row.scrollIntoViewIfNeeded();await row.focus();const scroll=await page.evaluate(()=>scrollY);expect(scroll).toBeGreaterThan(0);await row.press('Space');await expect(page.locator('#editor-message')).toBeVisible();await page.getByRole('button',{name:'Back to routing queue',exact:true}).click();await expect(page.locator('.queue-pagination').first()).toContainText('16–30');await expect(page.locator('[data-queue-id="'+id+'"]')).toBeFocused();expect(Math.abs(await page.evaluate(()=>scrollY)-scroll)).toBeLessThan(3);
 await page.locator('#primary-nav [data-view="casreps"]').click();await page.locator('#registry-results .cell-link').first().click();await expect(page.getByRole('button',{name:'Back to CASREP registry',exact:true})).toBeVisible();
});

test('queue stays usable with long titles, keyboard navigation, dark mode and narrow screens',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/v1/health',r=>r.fulfill({status:404,body:'{}'}));await page.goto('/#routing');await expect(page.locator('.queue-list')).toBeVisible();
 for(const size of [{width:1440,height:1000},{width:900,height:720},{width:390,height:844}]){
  await page.setViewportSize(size);await expect(page.getByLabel('Search reports',{exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Sort by',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const bounds=await page.locator('.queue-list tbody tr').first().boundingBox();if(size.width===1440)expect(bounds.height).toBeLessThan(100);
  await page.screenshot({path:info.outputPath('routing-list-'+size.width+'.png'),animations:'disabled'});
 }
 await page.setViewportSize({width:1440,height:1000});await page.locator('#appearance-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:info.outputPath('routing-list-dark.png'),animations:'disabled'});
 await page.locator('[data-queue-layout="board"]').click();await expect(page.locator('.queue-board')).toBeVisible();await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('routing-board-mobile.png'),animations:'disabled'});expect(errors).toEqual([]);
});


test('returning a reviewed report to Draft removes it from the review filter and restores queue focus',async({page})=>{
 await page.route('**/api/v1/health',r=>r.fulfill({status:404,body:'{}'}));await page.goto('/#routing');await page.getByLabel('Search reports',{exact:true}).fill('DEMO-26-001');await page.locator('[data-queue-stage="In review"]').click();await expect(page.locator('.queue-list tbody tr')).toHaveCount(1);
 await page.locator('.queue-list .cell-link').click();await page.getByRole('button',{name:'Return to draft',exact:true}).click();await page.locator('[name="note"]').fill('EXERCISE ONLY: queue return regression');await page.getByRole('button',{name:'Return draft',exact:true}).click();await expect(page.locator('#action-form')).toHaveCount(0);
 await page.getByRole('button',{name:'Back to routing queue',exact:true}).click();await expect(page.getByRole('heading',{name:'No reports match this view'})).toBeVisible();await expect(page.locator('#routing-results')).toBeFocused();await expect(page.locator('[data-queue-stage="Draft"] span')).toHaveText('1');await page.locator('[data-queue-stage="Draft"]').click();await expect(page.locator('.queue-list tbody tr')).toHaveCount(1);
});

test('compact board keeps four queues in columns with independent pages and restores sideways position',async({page},info)=>{
 await page.route('**/api/v1/health',r=>r.fulfill({status:404,body:'{}'}));await page.goto('/#routing');await page.locator('[data-queue-layout="board"]').click();
 const board=page.getByRole('region',{name:'Routing board',exact:true});await expect(board.locator('.routing-column')).toHaveCount(4);await expect(board.locator('.route-card').first()).toHaveAccessibleName(/^C[234] · DEMO-/);
 const original=await page.evaluate(()=>JSON.stringify(ReadinessApp.store.all()));
 for(const size of [{width:1440,height:1000},{width:1265,height:712},{width:900,height:720},{width:768,height:700},{width:390,height:844}]){
  await page.setViewportSize(size);
  const columns=await board.locator('.routing-column').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right};}));
  expect(Math.max(...columns.map(c=>c.y))-Math.min(...columns.map(c=>c.y))).toBeLessThan(1);
  expect(columns.every(c=>c.width>=183&&c.width<=261)).toBe(true);
  const heights=await board.locator('.route-card').evaluateAll(items=>items.map(el=>el.getBoundingClientRect().height));expect(Math.max(...heights)).toBeLessThan(121);
  const tops=await board.locator('.routing-column').evaluateAll(items=>items.map(el=>el.querySelector('.route-card').getBoundingClientRect().top));expect(Math.max(...tops)-Math.min(...tops)).toBeLessThan(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(size.width>=900)expect(columns.at(-1).right).toBeLessThanOrEqual(size.width);
  else expect(await board.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('compact-board-'+size.width+'.png'),animations:'disabled'});
 }
 await page.setViewportSize({width:1265,height:900});
 const review=board.locator('[aria-label="In review queue"]'),draft=board.locator('[aria-label="Draft queue"]');
 const draftFirst=await draft.locator('.route-card').first().getAttribute('data-open'),reviewFirst=await review.locator('.route-card').first().getAttribute('data-open');
 await review.getByRole('button',{name:'Next',exact:true}).click();await expect(review.locator('.pagination')).toContainText('7–12');expect(await review.locator('.route-card').first().getAttribute('data-open')).not.toBe(reviewFirst);expect(await draft.locator('.route-card').first().getAttribute('data-open')).toBe(draftFirst);
 await expect(draft.locator('.routing-column-head')).toContainText('Sailor / LPO');await expect(draft.locator('.route-card .next-owner')).toHaveCount(0);
 await page.locator('#appearance-toggle').click();await page.screenshot({path:info.outputPath('compact-board-dark.png'),animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await board.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
 const card=board.locator('[aria-label="Release authorized queue"] .route-card').first(),id=await card.getAttribute('data-open');await card.focus();const sideways=await board.evaluate(el=>el.scrollLeft);expect(sideways).toBeGreaterThan(0);
 await card.press('Enter');await expect(page.locator('#editor-message')).toBeVisible();await page.getByRole('button',{name:'Back to routing queue',exact:true}).click();await expect(page.locator('[data-queue-id="'+id+'"]')).toBeFocused();expect(Math.abs(await board.evaluate(el=>el.scrollLeft)-sideways)).toBeLessThan(2);await expect(review.locator('.pagination')).toContainText('7–12');
 expect(await page.evaluate(()=>JSON.stringify(ReadinessApp.store.all()))).toBe(original);
});

test('paging a sideways-scrolled board keeps the column visible and the next usable paging control focused',async({page},info)=>{
 await page.route('**/api/v1/health',r=>r.fulfill({status:404,body:'{}'}));await page.setViewportSize({width:390,height:844});await page.goto('/#routing');await page.locator('[data-queue-layout="board"]').click();
 const board=page.getByRole('region',{name:'Routing board',exact:true}),review=board.locator('[aria-label="In review queue"]');
 const next=review.getByRole('button',{name:'Next',exact:true}),previous=review.getByRole('button',{name:'Previous',exact:true});await board.evaluate(el=>{el.scrollLeft=194;});await next.scrollIntoViewIfNeeded();await next.focus();const sideways=await board.evaluate(el=>el.scrollLeft),vertical=await page.evaluate(()=>scrollY);expect(sideways).toBeGreaterThan(0);
 await next.press('Enter');await expect(review.locator('.pagination')).toContainText('7–12');expect(Math.abs(await board.evaluate(el=>el.scrollLeft)-sideways)).toBeLessThan(2);expect(Math.abs(await page.evaluate(()=>scrollY)-vertical)).toBeLessThan(2);await expect(next).toBeFocused();
 await next.press('Enter');await expect(review.locator('.pagination')).toContainText('13–14');await expect(next).toBeDisabled();await expect(previous).toBeFocused();expect(Math.abs(await board.evaluate(el=>el.scrollLeft)-sideways)).toBeLessThan(2);
 await previous.press('Enter');await expect(review.locator('.pagination')).toContainText('7–12');await expect(previous).toBeFocused();
 await page.screenshot({path:info.outputPath('board-mobile-pagination.png'),animations:'disabled'});
});
