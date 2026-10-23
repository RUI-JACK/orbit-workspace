'use strict';
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const {pipeline}=require('node:stream/promises');
const yazl=require('yazl'),yauzl=require('yauzl');
const MAGIC=Buffer.from('ORBITBK1'),HEADER=52;
const derive=(password,salt)=>promisify(crypto.scrypt)(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
function passwordCheck(password){if(typeof password!=='string'||password.length<8||password.length>1024)throw Error('备份密码需为 8–1024 个字符');}
function ensureStopped(core){core.assertAvailable();if(core.contexts.size||core.busy.size||core.automation?.active||core.sync?.active)throw Error('请先停止全部浏览器环境，再备份或恢复');}
function within(root,file){const rel=path.relative(root,path.resolve(file));return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
async function addTree(zip,root,prefix){
 if(!fs.existsSync(root))return;
 for(const item of await fsp.readdir(root,{withFileTypes:true})){
  if(['SingletonLock','SingletonCookie','SingletonSocket','parent.lock','.parentlock','lock'].includes(item.name))continue;
  const file=path.join(root,item.name),entry=prefix+'/'+item.name;
  if(item.isSymbolicLink())throw Error('环境含符号链接，无法备份：'+item.name);
  if(item.isDirectory()){zip.addEmptyDirectory(entry);await addTree(zip,file,entry);}
  else if(item.isFile())zip.addFile(file,entry);
 }
}
async function exportBackup(core,file,password){
 passwordCheck(password);ensureStopped(core);
 if(within(core.dataDir,file))throw Error('请将备份保存到工作台数据目录以外');
 core.workspaceBusy='创建备份';core.emit('changed');
 const temp=file+'.'+crypto.randomUUID()+'.tmp';let key;
 try{
  const salt=crypto.randomBytes(32),iv=crypto.randomBytes(12),header=Buffer.concat([MAGIC,salt,iv]);key=await derive(password,salt);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);
  const zip=new yazl.ZipFile();zip.on('error',e=>zip.outputStream.destroy(e));zip.addBuffer(Buffer.from(JSON.stringify({format:'orbit-backup-v1',createdAt:new Date().toISOString(),platform:process.platform,hostname:os.hostname(),profiles:core.state.profiles,proxyPool:core.state.proxyPool,extensions:core.state.extensions,settings:core.state.settings,automation:core.state.automation})), 'manifest.json');
  await fsp.writeFile(temp,header,{flag:'wx'});
  const writing=pipeline(zip.outputStream,cipher,fs.createWriteStream(temp,{flags:'a'}));
  // Observe failures immediately even while the directory walk is still running.
  writing.catch(()=>{});
  try{for(const p of core.state.profiles)await addTree(zip,core.profileDir(p.id),'profiles/'+p.id);for(const e of [...new Map((core.state.extensions||[]).map(e=>[e.sha256,e])).values()])zip.addFile(require('./extension-manager').packagePath(core,e),'extensions/'+e.sha256+'.xpi');zip.end();await writing;}
  catch(e){zip.outputStream.destroy(e);await writing.catch(()=>{});throw e;}
  await fsp.appendFile(temp,cipher.getAuthTag());await fsp.rename(temp,file);
  return{path:file,count:core.state.profiles.length,bytes:(await fsp.stat(file)).size};
 }finally{key?.fill(0);await fsp.rm(temp,{force:true}).catch(()=>{});core.workspaceBusy='';core.emit('changed');}
}
async function extract(zipFile,destination){
 const zip=await new Promise((resolve,reject)=>yauzl.open(zipFile,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(err,zip)=>err?reject(err):resolve(zip)));
 await new Promise((resolve,reject)=>{
  let count=0,total=0;const names=new Set();let failed=false;
  const fail=e=>{if(failed)return;failed=true;zip.close();reject(e);};
  zip.on('error',fail);zip.on('end',resolve);
  zip.on('entry',entry=>{(async()=>{
   if(++count>200000||(total+=entry.uncompressedSize)>64*1024**3)throw Error('备份文件过大');
   const name=entry.fileName,parts=name.replace(/\/$/,'').split('/');
   if(!name||name.includes('\\')||parts.some(p=>!p||p==='.'||p==='..'||/[\x00-\x1f:<>"|?*]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('备份路径无效');
   if(names.has(name.toLowerCase()))throw Error('备份存在重复文件');names.add(name.toLowerCase());
   const target=path.resolve(destination,...parts);if(!within(destination,target))throw Error('备份路径越界');
   const mode=entry.externalFileAttributes>>>16;if((mode&0xf000)===0xa000)throw Error('不允许恢复符号链接');
   if(name.endsWith('/'))await fsp.mkdir(target,{recursive:true});
   else {await fsp.mkdir(path.dirname(target),{recursive:true});const stream=await new Promise((resolve,reject)=>zip.openReadStream(entry,(err,s)=>err?reject(err):resolve(s)));await pipeline(stream,fs.createWriteStream(target,{flags:'wx'}));}
   zip.readEntry();
  })().catch(fail);});zip.readEntry();
 });
}
async function restoreBackup(core,file,password,cleanProfile){
 passwordCheck(password);ensureStopped(core);core.workspaceBusy='恢复备份';core.emit('changed');
 let stage;const moved=[];let key;const previous=structuredClone(core.state);let committed=false;
 try{
  stage=await fsp.mkdtemp(path.join(core.dataDir,'.restore-'));
  const handle=await fsp.open(file,'r');let header,tag,size;
  try{size=(await handle.stat()).size;if(size<HEADER+16)throw Error('不是有效的 Orbit 备份');header=Buffer.alloc(HEADER);tag=Buffer.alloc(16);await handle.read(header,0,HEADER,0);await handle.read(tag,0,16,size-16);}finally{await handle.close();}
  if(!header.subarray(0,8).equals(MAGIC))throw Error('不是有效的 Orbit 备份');
  key=await derive(password,header.subarray(8,40));const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(40,52));decipher.setAAD(header);decipher.setAuthTag(tag);
  const zipFile=path.join(stage,'content.zip');
  try{await pipeline(fs.createReadStream(file,{start:HEADER,end:size-17}),decipher,fs.createWriteStream(zipFile,{flags:'wx'}));}catch{throw Error('密码错误或备份文件已损坏；未改动现有环境');}
  const content=path.join(stage,'content');await fsp.mkdir(content);await extract(zipFile,content);
  const manifestFile=path.join(content,'manifest.json');if((await fsp.stat(manifestFile)).size>32*1024**2)throw Error('备份清单过大');
  const manifest=JSON.parse(await fsp.readFile(manifestFile,'utf8'));
  if(manifest.format!=='orbit-backup-v1'||!Array.isArray(manifest.profiles)||manifest.profiles.length>1000||!Array.isArray(manifest.proxyPool)||manifest.proxyPool.length>10000)throw Error('备份清单无效');
  const {inspectXpi,packagePath}=require('./extension-manager'),extensionMap=new Map(),extensionEntries=[];
  if(manifest.extensions!==undefined&&(!Array.isArray(manifest.extensions)||manifest.extensions.length>1000))throw Error('备份扩展清单无效');
  for(const raw of manifest.extensions||[]){
   if(!raw||!/^[0-9a-f-]{36}$/.test(raw.id)||extensionMap.has(raw.id)||!/^[0-9a-f]{64}$/.test(raw.sha256))throw Error('备份扩展标识无效');
   const file=path.join(content,'extensions',raw.sha256+'.xpi'),meta=await inspectXpi(file);if(meta.sha256!==raw.sha256||meta.addonId!==raw.addonId)throw Error('备份扩展包校验失败');
   const old=core.state.extensions.find(e=>e.sha256===meta.sha256)||extensionEntries.find(e=>e.sha256===meta.sha256),entry=old||{...meta,id:crypto.randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};extensionMap.set(raw.id,entry.id);if(!old)extensionEntries.push(entry);
  }
  const ids=new Set();const restored=manifest.profiles.map(raw=>{
   if(!raw||!/^[0-9a-f-]{36}$/.test(raw.id)||ids.has(raw.id))throw Error('备份环境 ID 无效');ids.add(raw.id);
   const p=cleanProfile({...raw,extensionIds:(raw.extensionIds||[]).map(id=>{if(!extensionMap.has(id))throw Error('备份环境引用了缺失的扩展');return extensionMap.get(id);})});p.name=(p.name+' · 恢复').slice(0,100);
   // Preserve the native identity as part of restoring the same saved device.
   if(raw.nativeIdentity&&p.engine==='camoufox'){if(typeof raw.nativeIdentity.config!=='object'||!raw.nativeIdentity.config)throw Error('设备配置无效');p.nativeIdentity=raw.nativeIdentity;}
   return{oldId:raw.id,profile:p};
  });
  const pool=manifest.proxyPool.map(p=>({...cleanProfile({name:'代理',proxy:p}).proxy,id:crypto.randomUUID(),createdAt:new Date().toISOString()}));
  const restoredTasks=[];if(manifest.automation){const tasks=manifest.automation.workflows;if(!Array.isArray(tasks)||tasks.length+(core.state.automation?.workflows.length||0)>100)throw Error('备份自动化任务数量无效');const profileMap=new Map(restored.map(r=>[r.oldId,r.profile.id])),newIds=new Set(profileMap.values());for(const task of tasks){if(!Array.isArray(task.profileIds)||task.profileIds.some(id=>!profileMap.has(id)))throw Error('备份任务引用了缺失的环境');restoredTasks.push(require('./automation').validateWorkflow({...task,id:undefined,name:(String(task.name)+' · 恢复').slice(0,100),profileIds:task.profileIds.map(id=>profileMap.get(id)),schedule:{...task.schedule,enabled:false}},{get:id=>{if(!newIds.has(id))throw Error('任务环境无效');}}));}}
  await fsp.mkdir(path.join(core.dataDir,'profiles'),{recursive:true});
  for(const {oldId,profile} of restored){const source=path.join(content,'profiles',oldId),target=path.join(core.dataDir,'profiles',profile.id);if(fs.existsSync(source)){await fsp.rename(source,target);moved.push(target);}}
  for(const {profile}of restored){const recordFile=path.join(core.dataDir,'profiles',profile.id,'camoufox','.orbit-managed-extensions.json');if(fs.existsSync(recordFile)){if(fs.statSync(recordFile).size>1024**2)throw Error('备份扩展管理记录过大');const record=JSON.parse(fs.readFileSync(recordFile,'utf8'));for(const [id,r]of Object.entries(record)){require('./extension-manager').addonId(id);if(extensionMap.has(r.libraryId))r.libraryId=extensionMap.get(r.libraryId);else delete record[id];}fs.writeFileSync(recordFile,JSON.stringify(record));}}
  for(const e of extensionEntries){const target=packagePath(core,e);if(!fs.existsSync(target)){await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.copyFile(path.join(content,'extensions',e.sha256+'.xpi'),target,fs.constants.COPYFILE_EXCL);moved.push(target);}else if(require('./extension-manager').hashFile(target)!==e.sha256)throw Error('本机扩展库文件损坏');}core.state.extensions.push(...extensionEntries);
  const {key:proxyKey}=require('./proxy-pool');const keys=new Set(core.state.proxyPool.map(proxyKey));for(const p of pool)if(!keys.has(proxyKey(p))){core.state.proxyPool.push(p);keys.add(proxyKey(p));}
  core.state.profiles.push(...restored.map(p=>p.profile));if(restoredTasks.length)core.state.automation.workflows.push(...restoredTasks);core.persist();committed=true;
  return{count:restored.length,taskCount:restoredTasks.length,proxyCount:core.state.proxyPool.length-previous.proxyPool.length,note:'恢复为新增环境；自动化任务重新关联新增环境，定时默认暂停。浏览器路径和现有设置保留。Chrome/Edge 加密登录信息跨 Windows 账户可能需要重新登录。'};
 }catch(e){if(!committed){core.state=previous;if(core.automation)core.automation.model=core.state.automation;for(const target of moved)if(within(path.join(core.dataDir,'profiles'),target)||within(path.join(core.dataDir,'extensions'),target))await fsp.rm(target,{recursive:true,force:true});}throw e;}
 finally{key?.fill(0);try{if(stage&&within(core.dataDir,stage))await fsp.rm(stage,{recursive:true,force:true});}finally{core.workspaceBusy='';core.emit('changed');}}
}
module.exports={exportBackup,restoreBackup};
