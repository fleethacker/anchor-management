const {test,expect}=require('./fixtures.cjs');

for(const mode of ['backend','static']){
  test(`${mode}: ship schedule stays in the report sidebar without rewriting locked traffic`,async({page},info)=>{
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
    const sidebar=page.getByRole('complementary',{name:'Report editor',exact:true});
    await expect(sidebar.getByRole('region',{name:'Ship schedule',exact:true})).toHaveCount(1);
    const fields=await sidebar.locator('.editor-field-section h3').allTextContents();
    expect(fields.slice(-2)).toEqual(['Remarks','Ship schedule']);
    const bounds=await sidebar.boundingBox(),paper=await page.locator('.editor-page').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(paper.x+paper.width);
    // The document starts immediately after navigation, with no schedule banner.
    const navigation=await page.locator('.editor-navigation').boundingBox(),body=await page.locator('#editor-panel').boundingBox();
    expect(Math.abs(body.y-navigation.y-navigation.height)).toBeLessThanOrEqual(1);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('editor-sidebar-schedule-desktop.png'),animations:'disabled'});
    await page.getByRole('button',{name:'Check report',exact:true}).click();await expect(panel).toHaveCount(0);
    await page.getByRole('button',{name:'Back to report fields',exact:true}).click();await expect(panel).toHaveCount(1);
    await page.getByRole('button',{name:'Revision history',exact:true}).click();await expect(panel).toHaveCount(0);
    await page.getByRole('button',{name:'Back to report fields',exact:true}).click();await expect(panel).toHaveCount(1);
    await page.getByRole('tab',{name:'Review & release',exact:true}).click();await expect(panel).toHaveCount(0);
    await page.getByRole('tab',{name:'Message traffic',exact:true}).click();
    await expect(page.locator('#editor-message')).toHaveValue(original);
    await expect(page.locator('.editor-statusbar > span').last()).toHaveText(revision);
    await page.reload();await expect(panel).toBeVisible();await expect(page.locator('#editor-message')).toHaveValue(original);
    // The schedule follows the report fields on compact screens too.
    await page.setViewportSize({width:390,height:844});
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeInViewport();
    await expect(sidebar.getByRole('region',{name:'Ship schedule',exact:true})).toHaveCount(1);
    const overflow=await panel.evaluate(el=>el.scrollWidth>el.clientWidth);
    expect(overflow).toBe(false);
    await page.screenshot({path:info.outputPath('editor-sidebar-schedule-compact.png'),animations:'disabled'});
    await panel.getByRole('button',{name:'Manage schedule',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Schedule Manager',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for(const mode of ['backend','static']){
  test(`${mode}: a new CASREP shows its saved shared schedule without visiting Schedule Manager`,async({page},info)=>{
    const schedule='06 NOV: FICTIONAL FIRST-OPEN PIER\n10 NOV: FICTIONAL FIRST-OPEN UNDERWAY';
    if(mode==='static'){
      await page.route('**/api/v1/health',route=>route.fulfill({status:404,contentType:'application/json',body:'{}'}));
      await page.addInitScript(text=>localStorage.setItem('casrep-ship-schedule-v1',JSON.stringify({name:'ship-schedule',text})),schedule);
    }else{
      await page.route('**/api/v1/command-settings*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:[{id:'first-open-schedule',name:'ship-schedule',text:schedule}],meta:{total:1,offset:0,limit:100}})}));
    }
    await page.goto('/#overview');
    await page.getByRole('button',{name:'New CASREP',exact:true}).click();
    const message=page.locator('#editor-message');
    expect(await message.inputValue()).toContain('SCHEDULE: 06 NOV: FICTIONAL FIRST-OPEN PIER');
    await expect(page.locator('#editor-save-state')).toHaveText(mode==='static'?'Saved locally':'Saved');
    await expect(message).toHaveValue(/SCHEDULE: 06 NOV: FICTIONAL FIRST-OPEN PIER/);
    await expect(message).toHaveValue(/10 NOV: FICTIONAL FIRST-OPEN UNDERWAY/);
    await expect(page.getByRole('region',{name:'Ship schedule',exact:true})).toContainText(schedule);
    await page.locator('#editor-field-title').fill('FIRST-OPEN SCHEDULE REGRESSION');
    await expect(page.locator('#editor-save-state')).toHaveText(mode==='static'?'Saved locally':'Saved');
    // Autosave reapplies the managed schedule and must synchronize that text without navigation.
    const withoutSchedule=(await message.inputValue()).replace(/SCHEDULE: [\s\S]*?(?=\/\/\nBT)/,'SCHEDULE: ');
    await message.fill(withoutSchedule);
    await expect(page.locator('#editor-save-state')).toHaveText(mode==='static'?'Saved locally':'Saved');
    await expect(message).toHaveValue(/SCHEDULE: 06 NOV: FICTIONAL FIRST-OPEN PIER/);
    const before=await message.inputValue();
    await page.reload();await expect(message).toHaveValue(before);
    const recovered=before.replace(/SCHEDULE: [\s\S]*?(?=\/\/\nBT)/,'SCHEDULE: ').replace('FIRST-OPEN SCHEDULE REGRESSION','RECOVERED FIRST-OPEN DRAFT');
    await message.fill(recovered);await page.reload();
    await expect(message).toHaveValue(/RECOVERED FIRST-OPEN DRAFT/);
    expect(await message.inputValue()).toContain('SCHEDULE: 06 NOV: FICTIONAL FIRST-OPEN PIER');
    await expect(page.locator('#editor-save-state')).toHaveText(mode==='static'?'Saved locally':'Saved');
    await page.screenshot({path:info.outputPath('first-open-schedule.png')});
  });
}
