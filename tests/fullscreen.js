'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {firefox}=require('playwright-core'),{OrbitCore}=require('../core'),{setDisplayDefaults}=require('../fingerprint-engine');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-fullscreen-')),core=new OrbitCore(root),out=path.join(__dirname,'../verification'),exec=promisify(execFile),results=[];
let server;
const video=path.join(out,'fullscreen-fixture.webm'),original=firefox.launchPersistentContext;
const probe=()=>({fullscreen:!!document.fullscreenElement,inner:{width:innerWidth,height:innerHeight},outer:{width:outerWidth,height:outerHeight},screen:{width:screen.width,height:screen.height},dpr:devicePixelRatio,client:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight},player:(()=>{const r=document.querySelector('#player').getBoundingClientRect();return{width:r.width,height:r.height};})(),playing:!document.querySelector('video').paused,currentTime:document.querySelector('video').currentTime});
let strip=false;
firefox.launchPersistentContext=function(dir,options){
 if(strip){
  const env={...options.env},keys=Object.keys(env).filter(k=>/^CAMOU_CONFIG_\d+$/.test(k)).sort((a,b)=>Number(a.split('_').pop())-Number(b.split('_').pop()));const config=JSON.parse(keys.map(k=>env[k]).join(''));
  for(const k of ['window.innerWidth','window.innerHeight'])delete config[k];
  for(const k of keys)delete env[k];const json=JSON.stringify(config);for(let i=0;i<json.length;i+=2000)env['CAMOU_CONFIG_'+(i/2000+1)]=json.slice(i,i+2000);
  options={...options,env};
 }
 return original.call(this,dir,options).catch(e=>{console.error(String(e.message).slice(0,2400));throw e;});
};
(async()=>{
 if(!fs.existsSync(video))await exec('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=10','-t','3','-c:v','libvpx','-b:v','200k','-an','-y',video],{windowsHide:true,timeout:30000});
 server=http.createServer((r,s)=>{
  if(r.url==='/video.webm'){s.setHeader('Content-Type','video/webm');s.end(fs.readFileSync(video));return;}
  s.setHeader('Content-Type','text/html');s.end('<!doctype html><title>Orbit fullscreen video regression</title><style>html,body{margin:0;background:#fff}#player{position:relative;width:100vw;height:100vh;background:#14326b}video{width:100%;height:100%;object-fit:contain}button{position:absolute;left:30px;top:30px;padding:18px}</style><div id="player"><video muted loop playsinline src="/video.webm"></video><button id="full">Video fullscreen</button></div><script>document.querySelector("#full").onclick=()=>{document.querySelector("video").play();document.querySelector("#player").requestFullscreen()};</script>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 setDisplayDefaults({width:1440,height:900,scaleFactor:2});
 const modes=process.env.ORBIT_FULLSCREEN_AB==='1'?['baseline','unpinned-experiment']:['fixed','saved-identity'];
 let savedIdentity;
 for(const mode of modes){
  strip=mode==='unpinned-experiment';
  const p=core.saveProfile({name:mode,engine:'camoufox',startUrls:[url],fingerprint:{viewport:{width:1366,height:768},native:{screenWidth:1440,screenHeight:900,deviceScaleFactor:2}}});
  if(mode==='saved-identity')core.get(p.id).nativeIdentity=savedIdentity;
  await core.start(p.id);const page=core.contexts.get(p.id).pages()[0];await page.waitForURL(url);await page.waitForLoadState('load');
  const before=await page.evaluate('mw:('+probe.toString()+')()');
  await page.locator('#full').click();await page.waitForFunction(()=>!!document.fullscreenElement);await page.waitForTimeout(700);
  const full=await page.evaluate('mw:('+probe.toString()+')()');
  const screenshot=path.join(out,'fullscreen-'+mode+'.png');
  await exec('powershell.exe',['-NoProfile','-File',path.join(__dirname,'../scripts/capture-firefox-window.ps1'),'-ProfilePath',path.join(core.profileDir(p.id),'camoufox'),'-OutputPath',screenshot],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});
  const png=fs.readFileSync(screenshot),pixels={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);await page.waitForTimeout(200);const after=await page.evaluate('mw:('+probe.toString()+')()');
  const row={mode,before,full,after,pixels,screenshot};results.push(row);console.log(JSON.stringify(row));
  if(process.env.ORBIT_FULLSCREEN_AB!=='1'){
   assert.equal(full.playing,true);assert.ok(full.currentTime>0);assert.ok(Math.abs(full.player.width*full.dpr-pixels.width)<=2);assert.ok(Math.abs(full.player.height*full.dpr-pixels.height)<=2);assert.ok(full.inner.height>before.inner.height);assert.equal(after.inner.width,before.inner.width);assert.equal(after.inner.height,before.inner.height);assert.equal(full.screen.width,1440);assert.equal(full.screen.height,900);
  }
  savedIdentity=structuredClone(core.get(p.id).nativeIdentity);
  // Simulate old persisted geometry in the identity that the migration must remove.
  Object.assign(savedIdentity.config,{'window.innerWidth':1366,'window.innerHeight':768,'window.outerWidth':1366,'window.outerHeight':854,'window.screenX':0,'window.screenY':0});
  await core.stop(p.id);
 }
 fs.writeFileSync(path.join(out,process.env.ORBIT_FULLSCREEN_AB==='1'?'fullscreen-ab-results.json':'fullscreen-results.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{firefox.launchPersistentContext=original;await core.shutdown();server?.closeAllConnections();server?.close();console.log('Disposable test data: '+root);});
