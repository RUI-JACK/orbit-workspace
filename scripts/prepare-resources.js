'use strict';
// Fetch redistributable upstream components instead of committing browser binaries.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const U=require('../update-utils'),{validateEngine,applyEngineOverlay}=require('../update-manager');
const root=path.join(__dirname,'..'),native=path.join(root,'native-engine/camoufox'),version='156.0.1-beta.36';
async function text(url){const r=await U.fetchResponse(fetch,url);const b=Buffer.from(await r.arrayBuffer());if(b.length>4*1024**2)throw Error('Metadata too large');return b.toString('utf8');}
async function run(file,args,env){await new Promise((ok,no)=>{const p=spawn(file,args,{env:{...process.env,...env},stdio:'inherit',windowsHide:true});p.on('error',no);p.on('exit',c=>c===0?ok():no(Error('Resource preparation exited '+c)));});}
(async()=>{
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('Build resources on Windows x64.');
 if(!fs.existsSync(path.join(native,'camoufox.exe'))){
  const tag='v'+version,meta=await U.fetchJson(fetch,'https://api.github.com/repos/daijro/camoufox/releases/tags/'+tag),name='camoufox-'+version+'-win.x86_64.zip',a=meta.assets?.find(a=>a.name===name);
  if(!a||!/^sha256:[a-f0-9]{64}$/.test(a.digest||''))throw Error('Official pinned browser checksum unavailable');
  const url='https://github.com/daijro/camoufox/releases/download/'+tag+'/'+name;if(a.browser_download_url!==url)throw Error('Unexpected browser asset URL');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-resources-')),zip=path.join(temp,name);
  console.log('Downloading official Camoufox '+version);await U.download(fetch,{url,size:a.size,sha256:a.digest.slice(7)},zip);await U.extract(zip,native);validateEngine(native,version);applyEngineOverlay(native);
 }else validateEngine(native,version);
 const model=path.join(root,'native-engine/model');
 if(!fs.existsSync(path.join(model,'.pinned-model'))||!fs.existsSync(path.join(model,'values.dat')))await run(process.execPath,[path.join(__dirname,'prepare-model.js')],{CAMOUFOX_FPGEN_DATA:model});
 const info=require('../update-runtime/runtime.json'),nodeRoot=path.join(root,'update-runtime',info.nodeVersion),exe=path.join(nodeRoot,'node.exe');
 if(!fs.existsSync(exe)){
  const base='https://nodejs.org/dist/'+info.nodeVersion+'/',sums=await text(base+'SHASUMS256.txt'),digest=sums.match(/^([a-f0-9]{64})\s+win-x64\/node\.exe\r?$/m)?.[1];
  if(!digest)throw Error('Official Node.js checksum unavailable');const url=base+'win-x64/node.exe',head=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(30000)}),size=Number(head.headers.get('content-length'));
  if(!head.ok||!size)throw Error('Node.js runtime metadata unavailable');await U.download(fetch,{url,size,sha256:digest},exe);
 }
 console.log('Windows x64 browser, pinned model and update runtime are ready.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
