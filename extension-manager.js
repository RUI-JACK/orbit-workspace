'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),yauzl=require('yauzl');
const uuid=/^[0-9a-f-]{36}$/;
const hashFile=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function addonId(value){if(typeof value!=='string'||value.length>200||!(/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9_.-]+$/.test(value)||/^\{[0-9a-f-]{36}\}$/i.test(value)))throw Error('扩展必须声明有效的 Firefox 扩展 ID');return value;}
function jsonFile(file,fallback){if(!fs.existsSync(file))return fallback;if(fs.statSync(file).size>16*1024**2)throw Error('扩展记录文件过大');return JSON.parse(fs.readFileSync(file,'utf8'));}
async function inspectXpi(file){
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>100*1024**2)throw Error('请选择不超过 100 MB 的 XPI 文件');
 const zip=await new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true,strictFileNames:true,validateEntrySizes:true},(e,z)=>e?reject(Error('无法读取 XPI：'+e.message)):resolve(z)));
 const metadata=new Map();
 await new Promise((resolve,reject)=>{let count=0,total=0,failed=false;const names=new Set();const fail=e=>{if(failed)return;failed=true;zip.close();reject(e);};zip.on('error',fail);zip.on('end',resolve);zip.on('entry',entry=>{(async()=>{
  const n=entry.fileName,parts=n.replace(/\/$/,'').split('/');
  if(++count>20000||(total+=entry.uncompressedSize)>250*1024**2)throw Error('XPI 解压大小或文件数量超出限制');
  if(n.includes('\\')||parts.some(p=>!p||p==='.'||p==='..'||/[\x00-\x1f:]/.test(p))||n.startsWith('/')||names.has(n.toLowerCase())||(entry.generalPurposeBitFlag&1)||((entry.externalFileAttributes>>>16)&0xf000)===0xa000)throw Error('XPI 包含无效路径、重复文件或加密文件');names.add(n.toLowerCase());
  if(n==='manifest.json'||/^_locales\/[^/]+\/messages\.json$/.test(n)){
   if(entry.uncompressedSize>1024**2)throw Error('扩展清单或语言文件过大');
   const stream=await new Promise((resolve,reject)=>zip.openReadStream(entry,(e,s)=>e?reject(e):resolve(s)));const chunks=[];for await(const c of stream)chunks.push(c);metadata.set(n,Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,''));
  }zip.readEntry();
 })().catch(fail);});zip.readEntry();});
 let m;try{m=JSON.parse(metadata.get('manifest.json'));}catch{throw Error('扩展缺少有效的 manifest.json');}
 if(![2,3].includes(m.manifest_version)||typeof m.version!=='string'||!m.version||m.version.length>100||typeof m.name!=='string')throw Error('不是有效的 Firefox WebExtension 清单');
 const id=addonId(m.browser_specific_settings?.gecko?.id||m.applications?.gecko?.id);
 const localized=value=>{if(typeof value!=='string')return '';const key=/^__MSG_(.+)__$/.exec(value);if(!key)return value.slice(0,1000);for(const locale of [m.default_locale,'en','en_US']){try{const messages=JSON.parse(metadata.get('_locales/'+locale+'/messages.json'));const entry=Object.entries(messages).find(([k])=>k.toLowerCase()===key[1].toLowerCase());if(entry?.[1]?.message)return String(entry[1].message).slice(0,1000);}catch{}}return value.slice(0,1000);};
 return{addonId:id,name:localized(m.name).slice(0,200),version:m.version,description:localized(m.description),manifestVersion:m.manifest_version,permissions:[...(Array.isArray(m.permissions)?m.permissions:[]),...(Array.isArray(m.host_permissions)?m.host_permissions:[])].filter(p=>typeof p==='string').slice(0,200),sha256:hashFile(file),size:stat.size};
}
const packagePath=(core,e)=>{if(!/^[0-9a-f]{64}$/.test(e.sha256))throw Error('扩展包校验值无效');return path.join(core.dataDir,'extensions','packages',e.sha256+'.xpi');};
const nativeDir=(core,p)=>path.join(core.profileDir(p.id),'camoufox');
function owned(core,p){const record=jsonFile(path.join(nativeDir(core,p),'.orbit-managed-extensions.json'),{});for(const [id,r]of Object.entries(record)){addonId(id);if(!r||!uuid.test(r.libraryId)||!/^[0-9a-f]{64}$/.test(r.sha256))throw Error('环境的扩展管理记录损坏');}return record;}
function installed(core,p){const data=jsonFile(path.join(nativeDir(core,p),'extensions.json'),{addons:[]});return (data.addons||[]).filter(a=>a.type==='extension'&&!a.isSystem&&!a.isBuiltin&&a.location==='app-profile').map(a=>({addonId:a.id,name:a.defaultLocale?.name||a.id,version:a.version,active:!!a.active,userDisabled:!!a.userDisabled,appDisabled:!!a.appDisabled,isCompatible:a.isCompatible,signedState:a.signedState}));}
function installPlans(core,profiles,onLaunch=false){
 const changes=[];
 for(const p of profiles){
  if(p.engine!=='camoufox')throw Error('扩展统一管理暂时仅支持 Camoufox / Firefox 环境');
  const before=owned(core,p),next={},dir=nativeDir(core,p),extDir=path.join(dir,'extensions');
  for(const id of p.extensionIds||[]){const e=core.state.extensions.find(e=>e.id===id);if(!e)throw Error('环境引用的扩展不在扩展库中');addonId(e.addonId);const source=packagePath(core,e);if(!fs.existsSync(source)||hashFile(source)!==e.sha256)throw Error('扩展包丢失或已损坏：'+e.name);const target=path.join(extDir,e.addonId+'.xpi');const current=fs.existsSync(target)?hashFile(target):null;
   if(next[e.addonId])throw Error('同一环境不能分配同一扩展的多个版本');
   if(onLaunch&&current&&before[e.addonId]&&current!==e.sha256&&current!==before[e.addonId].sha256){next[e.addonId]=before[e.addonId];continue;}
   if(current&&current!==e.sha256&&(!before[e.addonId]||current!==before[e.addonId].sha256))throw Error('「'+p.name+'」已有不同版本的 '+e.name+'，请先在该环境卸载它，或收录当前版本后再分配');
   if(current!==e.sha256)changes.push({target,source});next[e.addonId]={libraryId:e.id,sha256:e.sha256};
  }
  for(const [id,r]of Object.entries(before))if(!next[id]){const target=path.join(extDir,id+'.xpi');if(fs.existsSync(target)){if(hashFile(target)!==r.sha256&&!core.state.extensions.some(e=>e.addonId===id&&e.sha256===hashFile(target)))throw Error('「'+p.name+'」的扩展已被浏览器更新，请先收录当前版本再移除');changes.push({target});}}
  changes.push({target:path.join(dir,'.orbit-managed-extensions.json'),data:JSON.stringify(next)});
 }
 return changes;
}
function transaction(changes,commit){
 const undo=[];try{for(const c of changes){fs.mkdirSync(path.dirname(c.target),{recursive:true});const suffix='.orbit-'+crypto.randomUUID(),temp=c.target+suffix+'.tmp',backup=c.target+suffix+'.bak';const exists=fs.existsSync(c.target);if(c.source)fs.copyFileSync(c.source,temp);else if(c.data!==undefined)fs.writeFileSync(temp,c.data);if(exists)fs.renameSync(c.target,backup);undo.push({target:c.target,temp,backup,exists});if(c.source||c.data!==undefined)fs.renameSync(temp,c.target);}commit();}
 catch(e){for(const u of undo.reverse()){fs.rmSync(u.target,{force:true});if(u.exists)fs.renameSync(u.backup,u.target);fs.rmSync(u.temp,{force:true});}throw e;}
 for(const u of undo){fs.rmSync(u.backup,{force:true});fs.rmSync(u.temp,{force:true});}
}
function statuses(core){return core.state.profiles.filter(p=>p.engine==='camoufox').map(p=>{
 let list=[],error='',managed={},attempt={};try{list=installed(core,p);managed=owned(core,p);attempt=jsonFile(path.join(nativeDir(core,p),'.orbit-extension-attempt.json'),{});}catch(e){error='扩展记录读取失败：'+e.message;}
 const rows=list.map(a=>{const entry=core.state.extensions.find(e=>e.addonId===a.addonId&&(p.extensionIds||[]).includes(e.id))||core.state.extensions.find(e=>e.id===managed[a.addonId]?.libraryId)||core.state.extensions.find(e=>e.addonId===a.addonId),r=managed[a.addonId],assigned=(p.extensionIds||[]).includes(entry?.id);let status=a.appDisabled?'error':a.userDisabled?'disabled':a.active?'enabled':'inactive',detail=a.appDisabled?'浏览器已禁止加载（可能为签名、兼容性或策略限制）':a.userDisabled?'已在浏览器中禁用':a.active?'浏览器记录为已启用；未检测后台业务逻辑':'浏览器记录为未激活';if(assigned&&(r?.sha256!==entry.sha256||a.version!==entry.version)){status='pending';detail='扩展库版本有更新，下次启动应用';if(attempt.packages?.[a.addonId]===entry.sha256&&a.version!==entry.version){status='changed';detail='浏览器中的版本与扩展库不同；可收录当前版本后再管理';}}const pendingRemoval=!!entry&&!assigned&&!r&&!fs.existsSync(path.join(nativeDir(core,p),'extensions',a.addonId+'.xpi'));if(pendingRemoval){status='pending';detail='安装文件已移除，下次启动确认卸载';}return{...a,libraryId:entry?.id||null,managed:!!r,assigned,pendingRemoval,status,detail};});
 for(const id of p.extensionIds||[]){const e=core.state.extensions.find(e=>e.id===id);if(e&&!rows.some(a=>a.addonId===e.addonId)){const staged=managed[e.addonId]?.sha256===e.sha256&&fs.existsSync(path.join(nativeDir(core,p),'extensions',e.addonId+'.xpi'));const attempted=managed[e.addonId]?.sha256===e.sha256&&attempt.packages?.[e.addonId]===e.sha256&&!core.busy.has(p.id)&&(!core.contexts.has(p.id)||Date.now()-Date.parse(attempt.startedAt)>5000);rows.push({...e,libraryId:e.id,managed:staged,assigned:true,status:attempted?'error':'pending',detail:attempted?'启动后浏览器未登记此扩展；请检查 Firefox 签名、包结构或兼容性':staged?'已部署，启动环境后由浏览器校验加载':'待下次启动部署'});}}
 return{profileId:p.id,checkedAt:fs.existsSync(path.join(nativeDir(core,p),'extensions.json'))?fs.statSync(path.join(nativeDir(core,p),'extensions.json')).mtime.toISOString():null,error,addons:rows};
 });}
function installManager(OrbitCore){
 OrbitCore.prototype.extensionSnapshot=function(){return {library:structuredClone(this.state.extensions),environments:statuses(this)};};
 OrbitCore.prototype.importExtension=async function(file){
  this.assertAvailable();this.workspaceBusy='导入扩展';this.emit('changed');let previous;
  try{const meta=await inspectXpi(file),old=this.state.extensions.find(e=>e.addonId===meta.addonId);if(old?.sha256===meta.sha256)return {extension:structuredClone(old),duplicate:true};const now=new Date().toISOString(),entry={...meta,id:old?.id||crypto.randomUUID(),createdAt:old?.createdAt||now,updatedAt:now};const dest=packagePath(this,entry);fs.mkdirSync(path.dirname(dest),{recursive:true});if(!fs.existsSync(dest)){const temp=dest+'.tmp';fs.copyFileSync(file,temp);if(hashFile(temp)!==entry.sha256){fs.rmSync(temp,{force:true});throw Error('导入期间扩展文件发生变化');}fs.renameSync(temp,dest);}else if(hashFile(dest)!==entry.sha256)throw Error('库中同名扩展包校验失败');
   previous=this.state.extensions;this.state.extensions=old?previous.map(e=>e.id===old.id?entry:e):[...previous,entry];try{this.persist();}catch(e){this.state.extensions=previous;throw e;}return{extension:structuredClone(entry),updated:!!old};
  }finally{this.workspaceBusy='';this.emit('changed');}
 };
 OrbitCore.prototype.collectExtension=async function({profileId,addonId:id}){this.assertAvailable();const p=this.get(profileId);if(p.engine!=='camoufox')throw Error('请选择狐狸环境');addonId(id);const file=path.join(nativeDir(this,p),'extensions',id+'.xpi');if(!installed(this,p).some(a=>a.addonId===id)||!fs.existsSync(file))throw Error('该扩展不是可收录的本地 XPI');return this.importExtension(file);};
 OrbitCore.prototype.assignExtensions=function({profileIds,extensionIds,mode}){
  this.assertAvailable();if(!['add','remove'].includes(mode)||!Array.isArray(profileIds)||!profileIds.length||profileIds.length>100||!Array.isArray(extensionIds)||!extensionIds.length||extensionIds.length>100)throw Error('请选择 1–100 个环境和扩展');
  for(const id of extensionIds)if(!this.state.extensions.some(e=>e.id===id))throw Error('扩展不在库中');const profiles=[...new Set(profileIds)].map(id=>this.get(id));if(profiles.some(p=>this.contexts.has(p.id)||this.busy.has(p.id)||this.automation?.claimed.has(p.id)))throw Error('请先停止全部选中的环境');
  const changed=profiles.map(p=>({...p,extensionIds:mode==='add'?[...new Set([...(p.extensionIds||[]),...extensionIds])]:(p.extensionIds||[]).filter(id=>!extensionIds.includes(id))}));const plans=installPlans(this,changed),previous=this.state.profiles,map=new Map(changed.map(p=>[p.id,p]));
  transaction(plans,()=>{this.state.profiles=previous.map(p=>map.get(p.id)||p);try{this.persist();}catch(e){this.state.profiles=previous;throw e;}});return{updated:profiles.length};
 };
 OrbitCore.prototype.deleteExtensions=function(ids){this.assertAvailable();if(!Array.isArray(ids)||!ids.length)throw Error('请选择扩展');if(this.state.profiles.some(p=>(p.extensionIds||[]).some(id=>ids.includes(id))))throw Error('请先从所有环境移除此扩展，再删除库中记录');const previous=this.state.extensions;this.state.extensions=previous.filter(e=>!ids.includes(e.id));try{this.persist();}catch(e){this.state.extensions=previous;throw e;}return{deleted:previous.length-this.state.extensions.length};};
 OrbitCore.prototype.markExtensionLaunch=function(p){if(!(p.extensionIds||[]).length)return;const packages=Object.fromEntries((p.extensionIds||[]).map(id=>this.state.extensions.find(e=>e.id===id)).filter(Boolean).map(e=>[e.addonId,e.sha256]));fs.writeFileSync(path.join(nativeDir(this,p),'.orbit-extension-attempt.json'),JSON.stringify({startedAt:new Date().toISOString(),packages}));};
 OrbitCore.prototype.prepareExtensions=function(p){if(!(p.extensionIds||[]).length&&!fs.existsSync(path.join(nativeDir(this,p),'.orbit-managed-extensions.json')))return;transaction(installPlans(this,[p],true),()=>{});};
}
module.exports={installManager,inspectXpi,packagePath,hashFile,addonId};
