'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..'),pkg=require('../package.json');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run=(file,args)=>new Promise((ok,no)=>{const child=spawn(file,args,{cwd:root,stdio:'inherit',windowsHide:true});child.once('error',no);child.once('exit',code=>code===0?ok():no(Error('Build exited '+code)));});
(async()=>{
 if(process.platform!=='win32')throw Error('Build this Windows installer on Windows.');
 await run(process.execPath,[path.join(__dirname,'package.js')]);
 const stage=path.join(root,'dist/Orbit Workspace-win32-x64'),asar=require('@electron/asar'),archive=path.join(stage,'resources/app.asar');
 const entries=asar.listPackage(archive);
 const forbidden=entries.filter(name=>/^[\\/](?:\.update-signing|backups|verification|tests|scripts|installer|tools|analysis|releases|profiles|workspace\.dat(?:\.bak)?|Local State)(?:[\\/]|$)/i.test(name));
 if(forbidden.length)throw Error('Unexpected private/build data in application archive: '+forbidden.slice(0,10).join(', '));
 const frontend=['index.html','styles.css','app.js','operations.js'].map(name=>{
  const source=sha(path.join(root,'ui',name)),packed=crypto.createHash('sha256').update(asar.extractFile(archive,'ui/'+name)).digest('hex');
  if(source!==packed)throw Error('Frontend changed during packaging: '+name);return{name,sha256:source};
 });
 for(const file of ['Orbit Workspace.exe','resources/native-engine/camoufox/camoufox.exe','resources/native-engine/model/.pinned-model','resources/update-runtime/runtime.json']){
  if(!fs.existsSync(path.join(stage,file)))throw Error('Required packaged component missing: '+file);
 }
 const {build,Platform,Arch}=require('electron-builder');
 // Native browser/font resources are large; avoid a slow maximum-compression
 // rebuild for every code fix. A release operator can still explicitly set 9.
 process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL??='3';
 await build({targets:Platform.WINDOWS.createTarget(['nsis'],Arch.x64),prepackaged:stage,config:require('../installer/config.cjs'),publish:'never'});
 const out=path.join(root,'releases/installers'),name='Orbit-Setup-'+pkg.version+'-win-x64.exe',file=path.join(out,name);
 const installerHash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))installerHash.update(chunk);
 const manifest={version:pkg.version,architecture:'win32-x64',createdAt:new Date().toISOString(),installer:name,bytes:fs.statSync(file).size,sha256:installerHash.digest('hex'),appArchiveSha256:sha(archive),bundledNativeEngine:true,personalDataIncluded:false,frontend,codeSigned:false};
 fs.writeFileSync(path.join(out,'release-manifest.json'),JSON.stringify(manifest,null,2));
 fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),manifest.sha256+'  '+name+'\r\n');
 fs.copyFileSync(path.join(root,'docs/INSTALL.md'),path.join(out,'安装说明.txt'));
 console.log('INSTALLER '+file+' ('+Math.round(manifest.bytes/1024/1024)+' MiB)');
})().catch(e=>{console.error(e);process.exitCode=1;});
