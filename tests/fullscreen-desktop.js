'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),{_electron}=require('playwright-core');
const project=path.join(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-fullscreen-desktop-')),label=process.env.ORBIT_FULLSCREEN_LABEL||'packaged',rows=[];
let app;const exec=promisify(execFile),video=fs.readFileSync(path.join(project,'verification/fullscreen-fixture.webm'));
const server=http.createServer((r,s)=>{if(r.url==='/video.webm'){s.setHeader('Content-Type','video/webm');s.end(video);return;}s.setHeader('Content-Type','text/html');s.end('<!doctype html><title>Orbit fullscreen desktop regression</title><style>html,body{margin:0;background:white}#player{width:100vw;height:100vh;background:#14326b;position:relative}video{width:100%;height:100%;object-fit:contain}button{position:absolute;top:30px;left:30px;padding:18px}</style><div id="player"><video src="/video.webm" muted loop></video><button id="full">Fullscreen</button></div><script>document.querySelector("#full").onclick=()=>{document.querySelector("video").play();document.querySelector("#player").requestFullscreen()}</script>');});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 const env={...process.env,ORBIT_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:process.env.ORBIT_TEST_EXE||path.join(project,'dist/Orbit Workspace-win32-x64/Orbit Workspace.exe'),env});const ui=await app.firstWindow();await ui.locator('#new-profile').waitFor();
 await app.evaluate(({app})=>{const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/main.js'),{OrbitCore}=req('./core'),snapshot=OrbitCore.prototype.snapshot;OrbitCore.prototype.snapshot=function(...args){globalThis.fullscreenDesktopCore=this;return snapshot.apply(this,args);};});await ui.evaluate(()=>window.orbit.snapshot());
 const before=await ui.evaluate(()=>window.orbit.snapshot());assert.equal(before.version,require('../package.json').version);assert.equal(before.profiles.length,0);
 const p=await ui.evaluate(url=>window.orbit.saveProfile({name:'Fullscreen regression',engine:'camoufox',startUrls:[url],fingerprint:{viewport:{width:1366,height:768},native:{screenWidth:1440,screenHeight:900,deviceScaleFactor:2}}}),url);
 for(const mode of ['new','saved-identity']){
  if(mode==='saved-identity')await app.evaluate((_,id)=>{const core=globalThis.fullscreenDesktopCore,c=core.get(id).nativeIdentity.config;Object.assign(c,{'window.innerWidth':1366,'window.innerHeight':768});core.persist();},p.id);
  const started=await ui.evaluate(id=>window.orbit.startProfiles([id]),p.id);assert.equal(started[0].ok,true,started[0].error);
  const result=await app.evaluate(async(_,input)=>{
   const core=globalThis.fullscreenDesktopCore,page=core.contexts.get(input.id).pages()[0];await page.waitForURL(input.url,{timeout:10000});await page.waitForLoadState('load');
   const probe=()=>({inner:{width:innerWidth,height:innerHeight},player:{width:document.querySelector('#player').clientWidth,height:document.querySelector('#player').clientHeight},dpr:devicePixelRatio,playing:!document.querySelector('video').paused,currentTime:document.querySelector('video').currentTime,ua:navigator.userAgent,cookie:document.cookie});
   if(input.mode==='new')await page.evaluate(()=>{document.cookie='orbitFullscreen=keep; Max-Age=3600; Path=/';});
   const before=await page.evaluate('mw:('+probe.toString()+')()');await page.locator('#full').click();await page.waitForFunction(()=>!!document.fullscreenElement);await page.waitForTimeout(700);
   const full=await page.evaluate('mw:('+probe.toString()+')()');return{before,full,profileDir:core.profileDir(input.id),geometryPinRemoved:!('window.innerWidth' in core.get(input.id).nativeIdentity.config)&&!('window.innerHeight' in core.get(input.id).nativeIdentity.config)};
  },{id:p.id,url,mode});
  const screenshot=path.join(project,'verification/fullscreen-'+label+'-'+mode+'.png');await exec('powershell.exe',['-NoProfile','-File',path.join(project,'scripts/capture-firefox-window.ps1'),'-ProfilePath',path.join(result.profileDir,'camoufox'),'-OutputPath',screenshot],{windowsHide:true,maxBuffer:1024*1024,timeout:30000});
  const png=fs.readFileSync(screenshot),pixels={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
  const after=await app.evaluate(async(_,id)=>{const page=globalThis.fullscreenDesktopCore.contexts.get(id).pages()[0];await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);return page.evaluate('mw:({width:innerWidth,height:innerHeight})');},p.id);
  assert.ok(Math.abs(result.full.player.width*result.full.dpr-pixels.width)<=2);assert.ok(Math.abs(result.full.player.height*result.full.dpr-pixels.height)<=2);assert.equal(result.full.playing,true);assert.ok(result.full.currentTime>0);assert.ok(result.geometryPinRemoved);assert.equal(after.width,result.before.inner.width);assert.equal(after.height,result.before.inner.height);assert.ok(result.before.cookie.includes('orbitFullscreen=keep'));
  rows.push({mode,before:result.before,full:result.full,after,pixels,screenshot});console.log('PASS '+label+' '+mode+' real video fills '+pixels.width+'x'+pixels.height+', exits normally, cookie preserved');
  await ui.evaluate(id=>window.orbit.stopProfiles([id]),p.id);
 }
 fs.writeFileSync(path.join(project,'verification/fullscreen-'+label+'-results.json'),JSON.stringify({at:new Date().toISOString(),version:before.version,rows},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await app?.close();server.closeAllConnections();server.close();console.log('Disposable desktop data: '+root);});
