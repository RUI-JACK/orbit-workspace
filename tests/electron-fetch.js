'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{_electron}=require('playwright-core');
let app;const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-electron-network-'));
(async()=>{
 const env={...process.env,ORBIT_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:process.env.ORBIT_TEST_EXE||require('electron'),args:process.env.ORBIT_TEST_EXE?[]:[path.join(__dirname,'..')],env});const page=await app.firstWindow();await page.locator('#new-profile').waitFor();await page.evaluate(()=>window.orbit.saveUpdateSettings({autoCheck:false,autoDownload:false}));
 const result=await app.evaluate(async({app,net},root)=>{
  const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/main.js'),assert=req('node:assert/strict'),U=req('./update-utils'),fetcher=req('./electron-fetch').createUpdateFetcher(net),feed=req('./release-config.json').appFeed;
  const one=await fetcher(feed,{redirect:'manual'});assert.ok([301,302,303,307,308].includes(one.status));assert.ok(one.headers.get('location').startsWith('https://'));
  const manifest=U.verifyAppManifest(await U.fetchJson(fetcher,feed),req('./update-trust.json').publicKey);
  await assert.rejects(()=>fetcher('http://example.com'),/HTTPS/);await assert.rejects(()=>U.fetchJson(fetcher,feed,{allowedHosts:['example.com']}),/主机/);
  const aborted=new AbortController();aborted.abort();await assert.rejects(()=>fetcher(feed,{signal:aborted.signal}));
  await U.download(fetcher,manifest,req('node:path').join(root,'public-update.zip'));return{feed,version:manifest.version,manualRedirectStatus:one.status,signatureVerified:true,archiveSha256Verified:true,httpsOnly:true,hostAllowlistEnforced:true,cancellation:true};
 },root);
 fs.writeFileSync(path.join(__dirname,'../verification/electron-fetch-results.json'),JSON.stringify({at:new Date().toISOString(),...result},null,2));console.log('PASS actual Electron manual redirects, live signed manifest/download, HTTPS/host guards and abort');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await app?.close();});
