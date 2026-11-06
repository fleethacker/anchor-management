const {test,expect}=require('@playwright/test');

const stepTitles=[
  'Build a complete, reviewable message',
  'Move each report to the right reviewer',
  'Keep reports aligned with what changed',
  'Turn case history into a useful command picture'
];
const staticHealth=route=>route.fulfill({status:404,contentType:'application/json',body:'{}'});
const stepTab=(page,index)=>page.locator('#guide-step-'+index);

for(const mode of ['backend','static']){
  test(`${mode}: guide rendering rejects invalid indices and keeps DOM filter text inert`,async({page})=>{
    const errors=[],writes=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{
      if(request.url().includes('/api/v1/')&&!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+request.url());
    });
    if(mode==='static')await page.route('**/api/v1/health',staticHealth);
    await page.goto('/#policy');
    await expectStep(page,0);
    const original=await page.evaluate(()=>ReadinessApp.store.all());
    const payload='"><svg data-guide-injection onload="window.guideInjection=true"></svg>';

    // Exercise the DOM change -> shared state -> guide render path from CodeQL.
    await stepTab(page,2).click();
    for(const name of ['routeCategory','routeOwner','routeSort']){
      await page.locator('#primary-nav [data-view="routing"]').click();
      await page.locator('[name="'+name+'"]').evaluate((select,value)=>{
        select.add(new Option(value,value));
        select.value=value;
        select.dispatchEvent(new Event('change',{bubbles:true}));
      },payload);
      await page.locator('#policy-shortcut').click();
      await expectStep(page,2);
    }

    const invalid=[payload,'2',-1,4,1.5,null,true,{},NaN,Infinity,undefined];
    for(const value of invalid){
      await page.evaluate(value=>{ReadinessApp.state.guideStep=value;ReadinessApp.render();},value);
      await expectStep(page,0);
      await expect(page.locator('[data-guide-injection]')).toHaveCount(0);
      expect(await page.evaluate(()=>window.guideInjection)).toBeUndefined();
    }
    for(let index=0;index<4;index++){
      await stepTab(page,index).click();
      await page.evaluate(()=>ReadinessApp.render());
      await expectStep(page,index);
    }
    expect(await page.evaluate(()=>ReadinessApp.store.all())).toEqual(original);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

async function expectStep(page,index){
  const tabs=page.getByRole('tablist',{name:'CASREP workflow',exact:true});
  await expect(tabs.getByRole('tab')).toHaveCount(4);
  await expect(tabs.locator('[aria-selected="true"]')).toHaveCount(1);
  await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
  await expect(stepTab(page,index)).toHaveAttribute('aria-selected','true');
  await expect(stepTab(page,index)).toHaveAttribute('tabindex','0');
  await expect(stepTab(page,index)).toHaveAttribute('aria-controls','guide-step-panel');
  const panel=page.getByRole('tabpanel');
  await expect(panel).toHaveAttribute('id','guide-step-panel');
  await expect(panel).toHaveAttribute('aria-labelledby','guide-step-'+index);
  await expect(panel.getByRole('heading',{name:stepTitles[index],exact:true})).toBeVisible();
}

for(const mode of ['backend','static']){
  test(`${mode}: workspace tour launches the real tools without changing reports`,async({page})=>{
    const errors=[],writes=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{
      if(request.url().includes('/api/v1/')&&!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+request.url());
    });
    if(mode==='static')await page.route('**/api/v1/health',staticHealth);
    await page.goto('/#policy');
    await expect(page.getByRole('heading',{name:'Workspace guide',exact:true})).toBeVisible();
    const original=await page.evaluate(()=>ReadinessApp.store.all());
    const guide=page.locator('.workspace-guide');
    await expect(guide).toContainText(mode==='backend'?'Connected workspace':'Local browser workspace');
    await expect(guide.locator('[data-action="new-casrep"]').first()).toBeVisible();
    const reset=guide.locator('[data-action="reset"]');
    await expect(reset).toHaveCount(mode==='static'?1:0);
    if(mode==='static')await expect(reset).toBeHidden();

    for(let index=0;index<stepTitles.length;index++){
      await stepTab(page,index).click();
      await expectStep(page,index);
    }
    // The demo's primary action restarts the tour; it must not create an autosaving draft.
    await guide.getByRole('button',{name:'Take the tour',exact:true}).click();
    await expectStep(page,0);
    await expect(stepTab(page,0)).toBeFocused();
    await expect(stepTab(page,0)).toBeInViewport();
    await expect(page).toHaveURL(/#policy$/);
    expect(await page.evaluate(()=>ReadinessApp.store.all())).toEqual(original);
    await stepTab(page,2).click();
    await page.locator('#guide-step-panel [data-action="notifications"]').click();
    await expect(page.getByRole('dialog',{name:'CASREP update notifications',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await expectStep(page,2);

    await stepTab(page,3).click();
    await page.locator('#guide-step-panel [data-action="export-overview"]').click();
    await expect(page.locator('.co-brief')).toBeVisible();
    await expect(page.locator('.co-brief')).toContainText('Priority casualties');
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await expectStep(page,3);

    await guide.locator('a[href="#assistant"]').first().click();
    await expect(page).toHaveURL(/#assistant$/);
    await expect(page.locator('#ca-chat-input')).toBeVisible();
    await page.locator('[data-ca-close]').click();
    await expect(page).toHaveURL(/#policy$/);
    await expect(page.getByRole('heading',{name:'Workspace guide',exact:true})).toBeVisible();

    const tools=page.getByRole('navigation',{name:'Workspace tools',exact:true});
    await expect(tools.locator('button[data-view]')).toHaveCount(8);
    for(const view of ['overview','casreps','routing','analytics','logistics','plads','schedule','activity']){
      await tools.locator('[data-view="'+view+'"]').click();
      await expect(page).toHaveURL(new RegExp('#'+view+'$'));
      await expect(page.locator('.workspace-guide')).toHaveCount(0);
      await expect(page.locator('#main').getByRole('heading',{level:1}).first()).toBeVisible();
      await page.locator('#policy-shortcut').click();
      await expect(page.getByRole('heading',{name:'Workspace guide',exact:true})).toBeVisible();
    }
    expect(await page.evaluate(()=>ReadinessApp.store.all())).toEqual(original);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('workspace tour keeps keyboard focus and works at desktop, tablet and phone sizes',async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/v1/health',staticHealth);
  await page.goto('/#policy');
  await expect(page.locator('.workspace-guide')).toBeVisible();
  const original=await page.evaluate(()=>ReadinessApp.store.all());
  await stepTab(page,0).scrollIntoViewIfNeeded();
  await stepTab(page,0).focus();
  const scroll=await page.evaluate(()=>scrollY);
  for(const [key,index] of [['ArrowRight',1],['End',3],['ArrowLeft',2],['Home',0],['ArrowLeft',3]]){
    await page.getByRole('tablist',{name:'CASREP workflow',exact:true}).locator('[aria-selected="true"]').press(key);
    await expectStep(page,index);
    await expect(stepTab(page,index)).toBeFocused();
    expect(Math.abs(await page.evaluate(()=>scrollY)-scroll)).toBeLessThan(3);
  }
  // Presenters can advance sequentially without losing focus at either end of the tour.
  await stepTab(page,0).click();
  const previous=page.locator('[data-guide-move="-1"]'),next=page.locator('[data-guide-move="1"]');
  await expect(previous).toBeDisabled();
  for(let index=1;index<4;index++){
    await next.press('Enter');
    await expectStep(page,index);
    await expect(index===3?previous:next).toBeFocused();
  }
  await expect(next).toBeDisabled();
  for(let index=2;index>=0;index--){
    await previous.press('Enter');
    await expectStep(page,index);
    await expect(index===0?next:previous).toBeFocused();
  }
  await expect(previous).toBeDisabled();
  for(const size of [{width:1440,height:1000},{width:768,height:700},{width:390,height:844}]){
    await page.setViewportSize(size);
    await stepTab(page,0).click();
    await expectStep(page,0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(await page.locator('.workspace-guide').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath('workspace-guide-'+size.width+'.png'),fullPage:true,animations:'disabled'});
  }
  // Switch appearance through the existing control before checking the tour's dark surfaces.
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#appearance-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await stepTab(page,3).click();
  await expectStep(page,3);
  await page.screenshot({path:info.outputPath('workspace-guide-dark.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  await stepTab(page,2).click();
  await expectStep(page,2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('workspace-guide-dark-phone.png'),fullPage:true,animations:'disabled'});
  expect(await page.evaluate(()=>ReadinessApp.store.all())).toEqual(original);
  expect(errors).toEqual([]);
});
