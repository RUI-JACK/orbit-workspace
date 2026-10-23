'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {OrbitCore}=require('../core');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-core-'));
const core=new OrbitCore(dir);
const results=[];
const check=(name,fn)=>{assert.ok(fn);results.push({name,pass:true});console.log('PASS',name);};
let hits=0,authenticated=0;
const fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<title>Orbit local verification</title><h1>Orbit local fixture</h1>');});
const proxy=http.createServer((req,res)=>{
  hits++;
  if(req.headers['proxy-authorization']!=='Basic '+Buffer.from('orbit:secret').toString('base64')){res.writeHead(407,{'Proxy-Authenticate':'Basic realm="Orbit test"'});res.end();return;}
  authenticated++;
  let target;try{target=new URL(req.url);}catch{res.writeHead(400);res.end();return;}
  if(target.hostname!=='127.0.0.1'){res.writeHead(502);res.end();return;}
  const upstream=http.request(target,{headers:{host:target.host}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});upstream.end();
});
proxy.on('connect',(req,socket)=>socket.destroy());
async function listen(s){await new Promise(r=>s.listen(0,'127.0.0.1',r));return s.address().port;}
(async()=>{
 const port=await listen(fixture);const pp=await listen(proxy);const url=`http://127.0.0.1:${port}/`;
 const a=core.saveProfile({name:'QA A',group:'验证',tags:['隔离'],startUrls:[url],fingerprint:{locale:'en-US',timezoneId:'America/New_York',viewport:{width:1080,height:720},userAgent:'Orbit-QA/1.0'}});
 const b=core.saveProfile({name:'QA B',startUrls:[url]});
 check('CRUD + unique data directories',a.id!==b.id&&core.profileDir(a.id)!==core.profileDir(b.id));
 assert.throws(()=>core.saveProfile({name:'Bad',proxy:{server:'file:///tmp/x'}}));
 assert.throws(()=>core.saveProfile({name:'Bad',fingerprint:{timezoneId:'bad/timezone'}}));
 check('invalid configuration rejected',true);
 const batch=await core.batch('start',[a.id,b.id]);assert.ok(batch.every(r=>r.ok),JSON.stringify(batch));
 const pa=core.contexts.get(a.id).pages()[0],pb=core.contexts.get(b.id).pages()[0];
 await Promise.all([pa.waitForURL(url),pb.waitForURL(url)]);
 await Promise.all([pa.waitForLoadState('domcontentloaded'),pb.waitForLoadState('domcontentloaded')]);
 await pa.evaluate(()=>{document.cookie='orbit=A; max-age=3600; path=/';localStorage.setItem('orbit','A');});
 const isolated=await pb.evaluate(()=>({cookie:document.cookie,local:localStorage.getItem('orbit')}));
 check('two real Chrome profiles isolate Cookie and localStorage',!isolated.cookie.includes('orbit=A')&&isolated.local===null);
 await pb.evaluate(()=>{document.cookie='orbit=B; max-age=3600; path=/';localStorage.setItem('orbit','B');});
 const f=await pa.evaluate(()=>({ua:navigator.userAgent,locale:navigator.language,tz:Intl.DateTimeFormat().resolvedOptions().timeZone,width:innerWidth,height:innerHeight}));
 check('UA / locale / timezone / viewport applied in real browser',f.ua==='Orbit-QA/1.0'&&f.locale==='en-US'&&f.tz==='America/New_York'&&f.width===1080&&f.height===720);
 assert.throws(()=>core.deleteProfiles([a.id]));check('running profiles cannot be deleted',true);
 const cookies=await core.getCookies(a.id);await core.importCookies(b.id,[{name:'imported',value:'ok',url}]);
 check('Cookie read and import',cookies.some(c=>c.name==='orbit'&&c.value==='A')&&(await core.getCookies(b.id)).some(c=>c.name==='imported'));
 await core.close();await core.start(a.id);const reopened=core.contexts.get(a.id).pages()[0];await reopened.waitForURL(url);await reopened.waitForLoadState('domcontentloaded');
 check('Cookie and localStorage survive browser restart',await reopened.evaluate(()=>document.cookie.includes('orbit=A')&&localStorage.getItem('orbit')==='A'));
 await core.stop(a.id);
 const c=core.saveProfile({name:'QA proxy',startUrls:[url],proxy:{server:`http://127.0.0.1:${pp}`,username:'orbit',password:'secret'}});
 core.matchProxy=async()=>({locale:'en-US',timezoneId:'America/New_York'});
 await core.start(c.id);const pc=core.contexts.get(c.id).pages()[0];await pc.waitForURL(url);await pc.waitForLoadState('domcontentloaded');
 check('authenticated HTTP proxy carries actual browser request',hits>0&&authenticated>0&&(await pc.title())==='Orbit local verification');
 await core.stop(c.id);
 const dup=core.duplicateProfile(a.id);check('duplicate configuration has independent profile',dup.id!==a.id&&dup.name.includes('副本'));
 const restored=new OrbitCore(dir);check('saved configuration reloads',restored.get(a.id).name==='QA A');
 core.clearProfileData(a.id);check('clear stopped environment removes only its data',!fs.existsSync(core.profileDir(a.id))&&!!core.get(b.id));
 core.deleteProfiles([dup.id]);check('delete configuration',!core.snapshot().profiles.some(p=>p.id===dup.id));
 fs.mkdirSync(path.join(__dirname,'../verification'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../verification/core-results.json'),JSON.stringify({at:new Date().toISOString(),browser:core.state.settings.browserPath,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await core.close();fixture.closeAllConnections();proxy.closeAllConnections();fixture.close();proxy.close();if(path.resolve(dir).startsWith(path.join(os.tmpdir(),'orbit-core-')))fs.rmSync(dir,{recursive:true,force:true});});
