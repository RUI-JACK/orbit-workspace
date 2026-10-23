'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');
const {chromium} = require('playwright-core');
const {lookupProxyRegion}=require('./proxy-region');
const {normalizeNative,prepareNative,engineStatus}=require('./fingerprint-engine');
const {observeFingerprint}=require('./fingerprint-observation');
const DEFAULT_START_URL='https://www.google.com/';
const {configureNewTabs}=require('./new-tabs');
const {withLaunchLock}=require('./native-launch');
const diagnostics=require('./startup-diagnostics');

function browserCandidates() {
  return [
    ['Google Chrome', path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe')],
    ['Microsoft Edge', path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')],
    ['Google Chrome (用户安装)', path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')]
  ].filter(([,p])=>fs.existsSync(p)).map(([name,p])=>({name,path:p}));
}
function cleanProfile(input, existing) {
  if (!input || typeof input !== 'object') throw Error('环境格式无效');
  const text = (v,n=500)=>String(v??'').trim().slice(0,n);
  const name = text(input.name,100);
  if (!name) throw Error('请填写环境名称');
  const proxy = input.proxy || {};
  const server = text(proxy.server);
  if(server) {
    let u; try {u=new URL(server);} catch {throw Error('代理格式应为 http://主机:端口 或 socks5://主机:端口');}
    if(!['http:','https:','socks5:','socks4:'].includes(u.protocol) || !u.hostname || u.username || u.password || u.search || u.hash || u.pathname!=='/') {
      // URL with an omitted path normalizes to / for HTTP and to empty for SOCKS.
      if(!['http:','https:','socks5:','socks4:'].includes(u.protocol) || !u.hostname || u.username || u.password || u.search || u.hash || !['','/'].includes(u.pathname)) throw Error('代理地址无效；账号密码请填在单独的输入框中');
    }
    if(u.protocol.startsWith('socks') && (proxy.username||proxy.password)) throw Error('此版本不支持带账号密码的 SOCKS 代理，请使用 HTTP 代理');
  }
  const f = input.fingerprint || {};
  const engine=input.engine==='camoufox'?'camoufox':input.engine==='chromium'?'chromium':existing?.engine||'chromium';
  const native=normalizeNative(f.native,existing?.fingerprint?.native);
  const locale = text(f.locale || 'zh-CN',60);
  const timezoneId = text(f.timezoneId || 'Asia/Shanghai',100);
  try {new Intl.DateTimeFormat(locale,{timeZone:timezoneId});} catch {throw Error('语言或时区无效，例如 zh-CN / Asia/Shanghai');}
  const dim=(v,d,min,max)=>{const n=Number(v??d);if(!Number.isInteger(n)||n<min||n>max)throw Error('窗口尺寸超出范围');return n;};
  const startUrls = (Array.isArray(input.startUrls)?input.startUrls:[]).filter(Boolean).slice(0,10).map(v=>{
    const s=text(v,2000);if(s==='about:blank')return s;
    let u;try{u=new URL(s);}catch{throw Error('启动网址需要包含 http:// 或 https://');}
    if(!['http:','https:'].includes(u.protocol))throw Error('启动网址仅支持 HTTP/HTTPS');return u.href;
  });
  const ua=text(f.userAgent,1000); if(/[\r\n]/.test(ua))throw Error('User-Agent 不允许换行');
  const now=new Date().toISOString();
  const viewport={width:dim(f.viewport?.width,1280,480,3840),height:dim(f.viewport?.height,800,360,2160)};
  if(engine==='camoufox'&&(viewport.width>native.screenWidth||viewport.height+86>native.screenHeight))throw Error('指纹屏幕需容纳窗口：屏幕宽度不小于视口宽度，高度至少为视口高度 + 86');
  return {id:existing?.id || crypto.randomUUID(),engine,extensionIds:engine==='camoufox'?[...new Set((Array.isArray(input.extensionIds)?input.extensionIds:existing?.extensionIds||[]).filter(id=>typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id)))].slice(0,100):[],name,group:text(input.group,100)||'未分组',tags:[...new Set((Array.isArray(input.tags)?input.tags:[]).map(t=>text(t,40)).filter(Boolean))].slice(0,20),notes:text(input.notes,3000),proxy:{server,username:text(proxy.username,300),password:String(proxy.password??'').slice(0,500)},fingerprint:{userAgent:ua,locale,timezoneId,viewport,colorScheme:['light','dark','no-preference'].includes(f.colorScheme)?f.colorScheme:'light',native},...(engine==='camoufox'&&existing?.engine==='camoufox'&&existing.fingerprint?.native?.os===native.os&&existing.nativeIdentity?{nativeIdentity:existing.nativeIdentity}:{}),startUrls,createdAt:existing?.createdAt||now,updatedAt:now};
}
class OrbitCore extends EventEmitter {
  constructor(dataDir,codec={encode:v=>v,decode:v=>v}) {
    super();this.dataDir=path.resolve(dataDir);this.file=path.join(this.dataDir,'workspace.dat');this.codec=codec;this.contexts=new Map();this.busy=new Set();this.launches=new Set();
    fs.mkdirSync(this.dataDir,{recursive:true});
    this.state={version:1,profiles:[],proxyPool:[],settings:{browserPath:browserCandidates()[0]?.path||'',apiEnabled:false,apiPort:50326}};
    if(fs.existsSync(this.file)) {
      try {const saved=JSON.parse(codec.decode(fs.readFileSync(this.file)));if(saved.version!==1||!Array.isArray(saved.profiles))throw Error('格式错误');this.state=saved;
        for(const p of saved.profiles)if(!/^[0-9a-f-]{36}$/.test(p.id))throw Error('环境 ID 无效');
      }catch(e){throw Error('工作台数据读取失败，请保留数据文件再联系维护者：'+e.message);}
    }
    let migrated=false;if(typeof this.state.apiToken!=='string'||!/^[0-9a-f]{64}$/.test(this.state.apiToken)){this.state.apiToken=crypto.randomBytes(32).toString('hex');migrated=true;}
    if(!Array.isArray(this.state.proxyPool)){const {key}=require('./proxy-pool');const unique=new Map();for(const p of this.state.profiles)if(p.proxy?.server&&!unique.has(key(p.proxy)))unique.set(key(p.proxy),{...p.proxy,id:crypto.randomUUID(),createdAt:new Date().toISOString()});this.state.proxyPool=[...unique.values()];migrated=true;}
    if(!Array.isArray(this.state.extensions)){this.state.extensions=[];migrated=true;}
    if(migrated)this.persist();
    diagnostics.initialize(this);
    this.localApi=new (require('./local-api').LocalApi)(this);
    this.sync=new (require('./window-sync').WindowSync)(this);
    this.automation=new (require('./automation').AutomationManager)(this);
    this.recorder=new (require('./workflow-recorder').WorkflowRecorder)(this);
  }
  assertAvailable(){if(this.workspaceBusy)throw Error('正在'+this.workspaceBusy+'，请稍后再操作');if(this.shuttingDown)throw Error('工作台正在退出');}
  persist() {
    const tmp=this.file+'.tmp';fs.writeFileSync(tmp,this.codec.encode(JSON.stringify(this.state,null,2)));
    if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');
    fs.renameSync(tmp,this.file);this.emit('changed');
  }
  snapshot(){return {recorder:this.recorder?.snapshot()||null,sync:this.sync?.snapshot()||null,automation:this.automation?.snapshot()||null,workspaceBusy:this.workspaceBusy||'',operationProgress:this.operationProgress||null,updates:this.updates?.snapshot()||null,startupDiagnostics:this.getStartupDiagnostics(),extensions:this.extensionSnapshot(),proxyPool:structuredClone(this.state.proxyPool),profiles:this.state.profiles.map(p=>{const copy=structuredClone(p);if(copy.nativeIdentity)delete copy.nativeIdentity.config;return {...copy,running:this.contexts.has(p.id),busy:this.busy.has(p.id)};}),settings:{...this.state.settings},nativeEngine:engineStatus(),browserCandidates:browserCandidates(),api:this.localApi.status(),version:require('./package.json').version};}
  async matchProxy(proxy){const validated=cleanProfile({name:'代理查询',proxy}).proxy;return lookupProxyRegion(validated);}
  get(id){const p=this.state.profiles.find(p=>p.id===id);if(!p)throw Error('找不到该环境');return p;}
  profileDir(id){this.get(id);return path.join(this.dataDir,'profiles',id);}
  saveProfile(input){this.assertAvailable();const old=input.id?this.get(input.id):null;if(old&&(this.contexts.has(old.id)||this.busy.has(old.id)||this.automation?.claimed.has(old.id)))throw Error('请先停止环境后再编辑');const p=cleanProfile(input,old);if(p.extensionIds.some(id=>!this.state.extensions.some(e=>e.id===id)))throw Error('环境引用了不在本机扩展库中的扩展');if(old)this.state.profiles[this.state.profiles.indexOf(old)]=p;else this.state.profiles.push(p);this.persist();return structuredClone(p);}
  duplicateProfile(id){this.assertAvailable();const p=structuredClone(this.get(id));delete p.id;p.name+=' · 副本';return this.saveProfile(p);}
  deleteProfiles(ids){this.assertAvailable();if(!Array.isArray(ids))throw Error('请选择环境');if(this.state.automation?.workflows.some(w=>w.profileIds.some(id=>ids.includes(id))))throw Error('所选环境被自动化任务引用，请先编辑或删除对应任务');for(const id of ids){this.get(id);if(this.contexts.has(id)||this.busy.has(id)||this.automation?.claimed.has(id))throw Error('请先停止所选环境和自动化任务');}for(const id of ids)fs.rmSync(this.profileDir(id),{recursive:true,force:true});this.state.profiles=this.state.profiles.filter(p=>!ids.includes(p.id));this.state.startupHistory=this.state.startupHistory.filter(r=>!ids.includes(r.profileId));this.persist();return true;}
  async start(id){
    this.assertAvailable();
    const p=this.get(id);if(this.busy.has(id))throw Error('环境正在启动或停止');
    if(this.contexts.has(id)){const page=this.contexts.get(id).pages()[0];await page?.bringToFront();return;}
    const executablePath=this.state.settings.browserPath;
    this.busy.add(id);this.emit('changed');
    const run=this.beginStartup(p);
    try {
      const f=p.fingerprint;
      if(p.proxy.server){await run.stage('proxy',()=>this.probeStartupProxy(p.proxy));const region=await run.stage('region',()=>this.matchProxy(p.proxy));f.locale=region.locale;f.timezoneId=region.timezoneId;p.lastProxyRegion=region;p.updatedAt=new Date().toISOString();this.persist();}
      else{run.skip('proxy','直连环境，无独立代理');run.skip('region','直连环境，保留手动语言与时区');}
      if(this.shuttingDown)throw diagnostics.error('CANCELLED','工作台正在退出');
      let nativePrepared;
      await run.stage('prepare',async()=>{
        if(p.engine!=='camoufox'&&(!executablePath||!fs.existsSync(executablePath)))throw diagnostics.error('BROWSER_MISSING','未找到浏览器');
        if(p.engine==='camoufox'){if(!engineStatus().available)throw diagnostics.error('BROWSER_MISSING','内核文件缺失');this.prepareExtensions(p);nativePrepared=await prepareNative(p,path.join(this.profileDir(id),'camoufox'));p.nativeIdentity=nativePrepared.identity;this.persist();}
      });
      if(this.shuttingDown)throw diagnostics.error('CANCELLED','工作台正在退出');
      const context=await run.stage('launch',async()=>{
      const launching=nativePrepared?nativePrepared.launch():withLaunchLock(()=>chromium.launchPersistentContext(this.profileDir(id),{
        executablePath,headless:false,viewport:f.viewport,locale:f.locale,timezoneId:f.timezoneId,colorScheme:f.colorScheme,
        // This is an interactive workspace: keep extension installation and
        // previously installed extensions enabled in each persistent profile.
        ignoreDefaultArgs:['--disable-extensions'],
        ...(f.userAgent?{userAgent:f.userAgent}:{}),
        ...(p.proxy.server?{proxy:{server:p.proxy.server,username:p.proxy.username||undefined,password:p.proxy.password||undefined,bypass:'<-loopback>'}}:{}),
        // Mark this as an app-controlled window. Keep Playwright's SOCKS DNS
        // resolver rules; Chrome's startup infobar otherwise obscures the page.
        args:['--test-type=',`--window-size=${f.viewport.width},${f.viewport.height}`],timeout:30000
      }));
      this.launches.add(launching);
      try{return await launching;}finally{this.launches.delete(launching);}
      });
      this.contexts.set(id,context);
      if(p.engine==='camoufox')this.markExtensionLaunch(p);
      if(p.engine!=='camoufox')configureNewTabs(context,DEFAULT_START_URL);
      context.on('close',()=>{if(this.contexts.get(id)===context)this.contexts.delete(id);this.emit('changed');});
      const urls=p.startUrls.length?p.startUrls:[DEFAULT_START_URL];
      const task=run.stage('homepage',async()=>{
        const loads=[];
        for(let i=0;i<urls.length;i++){
          const page=i===0?(context.pages()[0]||await context.newPage()):await context.newPage();
          const load=page.goto(urls[i],{waitUntil:'domcontentloaded',timeout:20000}).then(response=>{if(response&&response.status()>=400)throw Object.assign(diagnostics.error('PAGE_HTTP','首页返回异常状态'),{httpStatus:response.status()});}).catch(e=>{if(urls.length>1)e.pageIndex=i+1;throw e;});
          load.catch(()=>{});loads.push(load);
        }
        const outcomes=await Promise.allSettled(loads),failed=outcomes.find(r=>r.status==='rejected');if(failed)throw failed.reason;
      }).then(()=>run.finish(),e=>run.finish(e)).finally(()=>this.startupTasks.delete(task));
      run.task=task;this.startupTasks.add(task);
    }catch(e){run.finish(e);const info=run.record.error;throw Object.assign(Error((run.record.stages.find(s=>s.error)?.label||'启动')+'：'+(info?.message||'操作失败')),{code:info?.code});}
    finally{this.busy.delete(id);this.emit('changed');}
  }
  async stop(id){this.assertAvailable();this.get(id);if(this.busy.has(id))throw Error('环境正在启动或停止');if(this.recorder?.includes(id))await this.recorder.stop({reason:'环境已停止'});await this.automation?.cancelFor(id);if(this.sync?.includes(id))this.sync.stop('参与同步的环境已停止');const c=this.contexts.get(id);if(!c)return;this.busy.add(id);this.emit('changed');try{await c.close();this.contexts.delete(id);await this.activeStartups.get(id)?.task;}finally{this.busy.delete(id);this.emit('changed');}}
  async batch(method,ids){if(!Array.isArray(ids)||ids.length>100)throw Error('每批最多操作 100 个环境');const out=[];for(const id of [...new Set(ids)]){try{await this[method](id);out.push({id,ok:true});}catch(e){out.push({id,ok:false,error:e.message});}}return out;}
  async initializeApi(){await this.localApi.configure(!!this.state.settings.apiEnabled,this.state.settings.apiPort);}
  async saveSettings(input){
    this.assertAvailable();if(this.settingsSaving)throw Error('设置正在保存，请稍后');
    const previous=this.state.settings,next={...previous};
    if(typeof input.browserPath==='string'){if(!fs.existsSync(input.browserPath)||!['chrome.exe','msedge.exe'].includes(path.basename(input.browserPath).toLowerCase()))throw Error('请选择本机 chrome.exe 或 msedge.exe');next.browserPath=path.resolve(input.browserPath);}
    if(input.apiEnabled!==undefined){if(typeof input.apiEnabled!=='boolean')throw Error('API 开关无效');next.apiEnabled=input.apiEnabled;}
    if(input.apiPort!==undefined){if(!Number.isInteger(input.apiPort)||input.apiPort<1024||input.apiPort>65535)throw Error('API 端口需为 1024–65535');next.apiPort=input.apiPort;}
    this.settingsSaving=true;
    try{await this.localApi.configure(!!next.apiEnabled,next.apiPort);this.state.settings=next;try{this.persist();}catch(e){this.state.settings=previous;await this.localApi.configure(!!previous.apiEnabled,previous.apiPort);throw e;}return {...next};}
    finally{this.settingsSaving=false;}
  }
  rotateApiToken(){this.assertAvailable();const previous=this.state.apiToken;this.state.apiToken=crypto.randomBytes(32).toString('hex');try{this.persist();}catch(e){this.state.apiToken=previous;throw e;}return true;}
  async shutdown(){this.updates?.close();this.shuttingDown=true;await this.recorder?.close();await this.sync?.close();await this.automation?.close();while(this.settingsSaving||this.localApi.changing)await new Promise(r=>setTimeout(r,20));try{await this.localApi.close();}finally{await this.close();}}
  async getCookies(id){const c=this.contexts.get(id);if(!c)throw Error('请先启动环境');return c.cookies();}
  async importCookies(id,cookies){this.assertAvailable();const c=this.contexts.get(id);if(!c)throw Error('请先启动环境');if(!Array.isArray(cookies)||cookies.length>10000)throw Error('Cookie 应为 JSON 数组');await c.addCookies(cookies);return cookies.length;}
  resetFingerprint(id){this.assertAvailable();const p=this.get(id);if(p.engine!=='camoufox')throw Error('请选择 Camoufox 指纹内核环境');if(this.contexts.has(id)||this.busy.has(id))throw Error('请先停止环境再重新生成指纹');delete p.nativeIdentity;p.fingerprint.native=normalizeNative(p.fingerprint.native);p.updatedAt=new Date().toISOString();this.persist();return true;}
  async inspectFingerprint(id){const p=this.get(id),ctx=this.contexts.get(id);if(!ctx)throw Error('请先启动环境再检测实际指纹');const page=await ctx.newPage();try{await page.goto('about:blank');const observed=await page.evaluate(p.engine==='camoufox'?'mw:('+observeFingerprint.toString()+')()':observeFingerprint);return {engine:p.engine||'chromium',identity:p.nativeIdentity?{hash:p.nativeIdentity.hash,version:p.nativeIdentity.version,generatedAt:p.nativeIdentity.generatedAt}:null,observed,configured:structuredClone(p.fingerprint),note:'本机空白页观测；不代表远程网站的全部检测结果。Canvas 保护会影响图像读取；字体/Emoji、TLS、WebGPU 等仍存在平台和内核边界。'};}finally{await page.close().catch(()=>{});}}
  clearProfileData(id){this.assertAvailable();if(this.contexts.has(id)||this.busy.has(id)||this.automation?.claimed.has(id))throw Error('请先停止环境和自动化任务');fs.rmSync(this.profileDir(id),{recursive:true,force:true});return true;}
  async close(){await this.sync?.close();await this.automation?.close();await Promise.allSettled([...this.launches]);await Promise.all([...this.contexts.values()].map(c=>c.close().catch(()=>{})));await Promise.allSettled([...this.startupTasks]);}
}
require('./profile-edit').installEditing(OrbitCore,cleanProfile);
require('./proxy-pool').installPool(OrbitCore,cleanProfile);
require('./extension-manager').installManager(OrbitCore);
diagnostics.installDiagnostics(OrbitCore);
OrbitCore.prototype.exportWorkspace=function(file,password){return require('./workspace-backup').exportBackup(this,file,password);};
OrbitCore.prototype.restoreWorkspace=function(file,password){return require('./workspace-backup').restoreBackup(this,file,password,cleanProfile);};
module.exports={OrbitCore,cleanProfile,browserCandidates,DEFAULT_START_URL};
