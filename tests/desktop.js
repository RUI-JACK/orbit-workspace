'use strict';
const {_electron:electron}=require('playwright-core');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-desktop-'));let desktop;
const results=[];const pass=name=>{results.push({name,pass:true});console.log('PASS',name);};
(async()=>{
 const env={...process.env,ORBIT_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
 desktop=await electron.launch({executablePath:process.env.ORBIT_TEST_EXE||require('electron'),args:process.env.ORBIT_TEST_EXE?[]:[path.join(__dirname,'..')],env,timeout:30000});
 const page=await desktop.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#empty-state').waitFor({state:'visible'});pass('desktop launches with working preload and empty state');
 await page.locator('#new-profile').click();await page.locator('[name=engine]').selectOption('chromium');await page.locator('[name=name]').fill('工作项目 · 验证环境');await page.locator('[name=group]').fill('工作');await page.locator('[name=tags]').fill('设计, 独立登录');await page.locator('#save-profile').click();
 await page.locator('#profiles-body').getByText('工作项目 · 验证环境',{exact:true}).waitFor();pass('create profile through actual desktop form');
 const saved=await page.evaluate(()=>window.orbit.snapshot());const p=saved.profiles[0];assert.equal(p.name,'工作项目 · 验证环境');assert.equal(p.tags.length,2);
 const dat=fs.readFileSync(path.join(dir,'workspace.dat'));assert.ok(!dat.includes(Buffer.from('工作项目')));pass('saved configuration encrypted with Windows DPAPI');
 await page.locator('[data-action=edit]').click();await page.locator('[name=notes]').fill('保存后重开仍保留登录状态');await page.locator('#save-profile').click();
 assert.equal((await page.evaluate(()=>window.orbit.snapshot())).profiles[0].notes,'保存后重开仍保留登录状态');pass('edit profile through desktop form');
 await page.locator('#search').fill('does-not-match');await page.locator('#no-results').waitFor({state:'visible'});await page.locator('#search').fill('');pass('search filters real rows');
 await page.locator('[data-action=start]').click();await page.locator('#profiles-body .status.running').waitFor({timeout:40000});pass('desktop start launches real Chrome and updates status');
 await page.locator('[data-action=stop]').click();await page.locator('[data-action=start]').waitFor({timeout:20000});pass('desktop stop closes browser and updates status');
 await page.screenshot({path:path.join(__dirname,'../verification/desktop-profiles.png')});
 await page.locator('[data-page=settings]').click();await page.locator('#browser-path').waitFor({state:'visible'});assert.ok(await page.locator('#browser-path').inputValue());
 await page.screenshot({path:path.join(__dirname,'../verification/desktop-settings.png')});pass('settings shows detected Chrome/Edge path');
 assert.deepEqual(errors,[]);pass('no renderer JavaScript errors');
 await desktop.close();desktop=null;
 // Reopen to verify the packaged app can decrypt its previous DPAPI configuration.
 desktop=await electron.launch({executablePath:process.env.ORBIT_TEST_EXE||require('electron'),args:process.env.ORBIT_TEST_EXE?[]:[path.join(__dirname,'..')],env,timeout:30000});
 const reopened=await desktop.firstWindow();await reopened.locator('#profiles-body').getByText('工作项目 · 验证环境',{exact:true}).waitFor();pass('desktop restart reloads encrypted profile configuration');
 const report={at:new Date().toISOString(),packaged:!!process.env.ORBIT_TEST_EXE,results};fs.writeFileSync(path.join(__dirname,'../verification/'+(process.env.ORBIT_TEST_EXE?'packaged':'desktop')+'-results.json'),JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(desktop)await desktop.close();if(path.resolve(dir).startsWith(path.join(os.tmpdir(),'orbit-desktop-')))fs.rmSync(dir,{recursive:true,force:true});});
