const {test,expect}=require('./fixtures.cjs');
test('overview briefing fits one landscape page and exports are removed',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');
 await expect(page.locator('#primary-nav [data-view="policy"]')).toHaveCount(0);
 await expect(page.locator('#policy-shortcut')).toBeVisible();
 await expect(page.getByRole('button',{name:/export|download/i})).toHaveCount(1);
 await page.getByRole('button',{name:'Export overview',exact:true}).click();
 const report=page.locator('.co-brief');await expect(report).toBeVisible();
 await expect(report).toContainText('Priority casualties');await expect(report).toContainText('Reporting watch items');
 await expect(report.locator('.brief-priorities tbody tr')).toHaveCount(8);
 const dimensions=await report.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,body:el.querySelector('.brief-content').getBoundingClientRect().bottom,footer:el.querySelector('.brief-footer').getBoundingClientRect().top,main:el.querySelector('.brief-main').scrollHeight,available:el.querySelector('.brief-main').clientHeight,side:el.querySelector('.brief-side').scrollHeight,sideAvailable:el.querySelector('.brief-side').clientHeight}));
 expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.height+1);expect(dimensions.body).toBeLessThan(dimensions.footer);expect(dimensions.main).toBeLessThanOrEqual(dimensions.available+1);expect(dimensions.side).toBeLessThanOrEqual(dimensions.sideAvailable+1);
 const pdf=await page.pdf({path:testInfo.outputPath('overview.pdf'),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true});
 const raw=pdf.toString('latin1');expect((raw.match(/\/Type\s*\/Page\b/g)||[]).length).toBe(1);expect(raw).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+792\s+612\s*\]/);
 await testInfo.attach('overview-pdf',{body:pdf,contentType:'application/pdf'});await page.screenshot({path:testInfo.outputPath('overview.png')});
 await page.getByRole('button',{name:'Close',exact:true}).click();
 for(const view of ['casreps','analytics','logistics','routing','plads','schedule','activity']){await page.locator('#primary-nav [data-view="'+view+'"]').click();await expect(page.getByRole('button',{name:/export|download/i})).toHaveCount(0);}
 await page.locator('#policy-shortcut').click();await expect(page.getByRole('heading',{name:'Workspace guide'})).toBeVisible();expect(errors).toEqual([]);
});
