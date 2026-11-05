const {test,expect}=require('@playwright/test');

for(const mode of ['backend','static']){
  test(`${mode}: ship schedule stays visible across editor tools and review without rewriting locked traffic`,async({page},info)=>{
    const schedule='05 NOV: FICTIONAL QA PIER\n10 NOV: FICTIONAL QA UNDERWAY';
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    if(mode==='static'){
      await page.route('**/api/v1/health',route=>route.fulfill({status:404,contentType:'application/json',body:'{}'}));
      await page.addInitScript(text=>localStorage.setItem('casrep-ship-schedule-v1',JSON.stringify({name:'ship-schedule',text})),schedule);
    }else{
      // Only the settings read is stubbed; use the isolated Go API for cases.
      await page.route('**/api/v1/command-settings*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:[{id:'schedule-visibility-test',name:'ship-schedule',text:schedule}],meta:{total:1,offset:0,limit:100}})}));
    }
    await page.goto('/#casrep/demo-001');
    const panel=page.getByRole('region',{name:'Ship schedule',exact:true});
    await expect(panel).toBeVisible();
    await expect(panel.locator('.editor-ship-schedule-text').first()).toHaveText(schedule);
    await expect(panel).toContainText('This locked report retains its saved message.');
    const original=await page.locator('#editor-message').inputValue();
    const revision=await page.locator('.editor-statusbar > span').last().textContent();
    const bounds=await panel.boundingBox(),body=await page.locator('#editor-panel').boundingBox();
    expect(bounds.y+bounds.height).toBeLessThanOrEqual(body.y+1);
    await page.getByRole('button',{name:'Check report',exact:true}).click();await expect(panel).toBeVisible();
    await page.getByRole('button',{name:'Revision history',exact:true}).click();await expect(panel).toBeVisible();
    await page.getByRole('tab',{name:'Review & release',exact:true}).click();await expect(panel).toBeVisible();
    await page.getByRole('tab',{name:'Message traffic',exact:true}).click();
    await expect(page.locator('#editor-message')).toHaveValue(original);
    await expect(page.locator('.editor-statusbar > span').last()).toHaveText(revision);
    await page.reload();await expect(panel).toBeVisible();await expect(page.locator('#editor-message')).toHaveValue(original);
    // The schedule must remain discoverable at the compact editor breakpoint.
    await page.setViewportSize({width:390,height:844});
    await expect(panel).toBeInViewport();
    const overflow=await panel.evaluate(el=>el.scrollWidth>el.clientWidth);
    expect(overflow).toBe(false);
    await page.screenshot({path:info.outputPath('editor-ship-schedule.png')});
    await panel.getByRole('button',{name:'Manage schedule',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Schedule Manager',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  });
}
