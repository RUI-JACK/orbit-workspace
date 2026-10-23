'use strict';
const net=require('node:net'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const STAGES=[['proxy','代理端口连接'],['region','出口地区查询'],['prepare','环境准备'],['launch','浏览器启动'],['homepage','首页加载']];
const error=(code,message)=>Object.assign(Error(message),{code});
function probeProxy(proxy,{timeout=3000}={}){
 let url;try{url=new URL(proxy.server);}catch{return Promise.reject(error('PROXY_ADDRESS','代理地址无效'));}
 const host=url.hostname.replace(/^\[|\]$/g,''),port=Number(url.port||({'http:':80,'https:':443,'socks5:':1080,'socks4:':1080}[url.protocol]));
 if(!host||!port)return Promise.reject(error('PROXY_ADDRESS','代理地址无效'));
 return new Promise((resolve,reject)=>{let settled=false,socket;const finish=(e)=>{if(settled)return;settled=true;clearTimeout(timer);socket?.destroy();e?reject(e):resolve();};const timer=setTimeout(()=>finish(error('PROXY_TIMEOUT','连接代理端口超时')),timeout);
  socket=net.createConnection({host,port});socket.once('connect',()=>finish());socket.once('error',e=>finish(error(e.code==='ECONNREFUSED'?'PROXY_REFUSED':e.code==='ENOTFOUND'||e.code==='EAI_AGAIN'?'PROXY_DNS':'PROXY_UNREACHABLE','无法连接代理端口')));
 });
}
const messages={
 PROXY_ADDRESS:['代理地址无效','检查环境的代理协议、主机与端口。'],
 PROXY_TIMEOUT:['连接代理端口超时','检查节点是否在线、代理软件是否运行，以及网络能否访问该端口。'],
 PROXY_REFUSED:['代理端口拒绝连接','检查代理软件是否运行、监听端口是否正确。'],
 PROXY_DNS:['无法解析代理主机名','检查代理主机名及本机 DNS。'],
 PROXY_UNREACHABLE:['无法连接代理端口','检查代理软件、节点和本机网络。'],
 PROXY_AUTH:['代理认证失败','检查该环境的代理用户名、密码或代理授权名单。'],
 REGION_TIMEOUT:['通过代理查询地区超时','端口可达，但地区请求未及时返回；检查节点出口和地区服务。'],
 REGION_INVALID:['地区服务未返回有效地区','检查地区服务状态；原来的语言与时区保留。'],
 REGION_HTTP:['地区服务返回异常状态','检查地区服务状态，稍后再试；不会回退到直连。'],
 REGION_ROUTE:['无法通过代理查询出口地区','端口可达不代表代理认证或出口正常；检查节点、认证与地区服务。'],
 BROWSER_MISSING:['未找到浏览器程序','到设置选择本机 Chrome / Edge，或检查狐狸内核文件是否完整。'],
 PREPARE_FAILED:['环境准备失败','检查扩展管理中的冲突或损坏提示，以及环境的指纹配置。'],
 LAUNCH_TIMEOUT:['浏览器启动超时','检查内核文件、磁盘空间或是否有遗留浏览器进程占用环境。'],
 LAUNCH_FAILED:['浏览器未能启动','检查浏览器文件是否完整，以及环境目录是否被其他进程占用。'],
 PAGE_TIMEOUT:['首页加载超时','浏览器已打开，可在环境中重新加载网页；检查节点和目标网站。'],
 PAGE_PROXY:['浏览器无法通过代理加载首页','检查该节点是否允许访问目标网站，以及浏览器代理认证。'],
 PAGE_DNS:['浏览器无法解析首页域名','检查节点的 DNS 与目标域名。'],
 PAGE_TLS:['首页 TLS 或证书校验失败','检查节点和目标网站证书、电脑时间；未关闭证书校验。'],
 PAGE_FAILED:['首页加载失败','浏览器已打开，可在环境中检查目标网址并重新加载。'],
 PAGE_HTTP:['首页返回异常 HTTP 状态','浏览器已打开；目标网站可能拒绝访问或暂时不可用。'],
 CANCELLED:['启动已取消','环境被关闭或工作台正在退出。'],
 PAGE_CANCELLED:['首页加载已中断','环境关闭或页面被重新导航；浏览器启动耗时已保留。'],
 INTERRUPTED:['上次启动未完成','工作台在上次记录完成前退出；可以重新启动环境查看新记录。']
};
function failure(stage,e){
 let code=e?.code,raw=String(e?.message||'');
 if(!Object.hasOwn(messages,code)){
  if(stage==='region')code=/407|proxy authentication|invalid.auth/i.test(raw)?'PROXY_AUTH':/timeout|timed out/i.test(raw)?'REGION_TIMEOUT':/HTTP \d{3}/.test(raw)?'REGION_HTTP':'REGION_ROUTE';
  else if(stage==='prepare')code='PREPARE_FAILED';
  else if(stage==='launch')code=/timeout|timed out/i.test(raw)?'LAUNCH_TIMEOUT':'LAUNCH_FAILED';
  else if(stage==='homepage')code=/closed|interrupted|ERR_ABORTED|NS_BINDING_ABORTED/i.test(raw)?'PAGE_CANCELLED':/timeout|timed out/i.test(raw)?'PAGE_TIMEOUT':/proxy|ERR_TUNNEL/i.test(raw)?'PAGE_PROXY':/CERT_|certificate|SSL|TLS|SEC_ERROR/i.test(raw)?'PAGE_TLS':/NAME_NOT_RESOLVED|UNKNOWN_HOST|ENOTFOUND/i.test(raw)?'PAGE_DNS':'PAGE_FAILED';
  else code='PROXY_UNREACHABLE';
 }
 const [message,hint]=messages[code];const httpStatus=(code==='PAGE_HTTP'||code==='REGION_HTTP')?Number(e?.httpStatus||raw.match(/HTTP (\d{3})/)?.[1]):0;
 return{code,message:(Number.isInteger(e?.pageIndex)&&e.pageIndex>=1&&e.pageIndex<=10?'第 '+e.pageIndex+' 个启动页面：':'')+message+(httpStatus>=400&&httpStatus<=599?'（HTTP '+httpStatus+'）':''),hint};
}
function trimHistory(core){const counts=new Map();core.state.startupHistory=core.state.startupHistory.filter(r=>{if(!core.state.profiles.some(p=>p.id===r.profileId))return false;const count=(counts.get(r.profileId)||0)+1;counts.set(r.profileId,count);return count<=10;}).slice(0,100);}
function persistLogs(core){try{core.persist();core.diagnosticWarning='';}catch{core.diagnosticWarning='诊断记录暂时无法保存到磁盘，当前记录仍可在本次运行中查看。';core.emit('changed');}}
class StartupRun{
 constructor(core,profile){this.core=core;this.started=performance.now();this.finished=false;this.record={id:crypto.randomUUID(),profileId:profile.id,engine:profile.engine||'chromium',startedAt:new Date().toISOString(),status:'running',currentStage:null,browserReadyMs:null,totalMs:null,stages:STAGES.map(([key,label])=>({key,label,status:'pending',durationMs:null}))};core.activeStartups.set(profile.id,this);core.state.startupHistory.unshift(this.record);trimHistory(core);persistLogs(core);}
 elapsed(){return Math.max(0,Math.round(performance.now()-this.started));}
 skip(key,reason){const stage=this.record.stages.find(s=>s.key===key);Object.assign(stage,{status:'skipped',durationMs:0,note:reason});this.core.emit('changed');}
 async stage(key,fn){
  const stage=this.record.stages.find(s=>s.key===key),start=performance.now();Object.assign(stage,{status:'running',startedAt:new Date().toISOString()});this.record.currentStage=key;this.core.emit('changed');
  try{const result=await fn();Object.assign(stage,{status:'ok',durationMs:Math.max(0,Math.round(performance.now()-start))});if(key==='launch')this.record.browserReadyMs=this.elapsed();return result;}
  catch(e){Object.assign(stage,{status:'error',durationMs:Math.max(0,Math.round(performance.now()-start)),error:failure(key,e)});throw e;}
  finally{this.core.emit('changed');}
 }
 finish(e){
  if(this.finished)return;this.finished=true;const r=this.record,stage=r.stages.find(s=>s.key===r.currentStage),info=e?(stage?.error||failure(r.currentStage,e)):null;
  r.status=!e?'ready':info.code==='PAGE_CANCELLED'||info.code==='CANCELLED'?'cancelled':r.browserReadyMs!==null?'warning':'failed';r.totalMs=this.elapsed();r.completedAt=new Date().toISOString();if(info)r.error=info;r.currentStage=null;
  if(this.core.activeStartups.get(r.profileId)===this)this.core.activeStartups.delete(r.profileId);persistLogs(this.core);
 }
}
function initialize(core){
 core.activeStartups=new Map();core.startupTasks=new Set();
 if(!Array.isArray(core.state.startupHistory))core.state.startupHistory=[];
 let changed=false;for(const r of core.state.startupHistory)if(r.status==='running'){r.status='interrupted';r.error=failure('',{code:'INTERRUPTED'});r.currentStage=null;for(const s of r.stages||[])if(s.status==='running'){s.status='interrupted';s.error=r.error;}changed=true;}
 trimHistory(core);if(changed)persistLogs(core);
}
function installDiagnostics(OrbitCore){
 OrbitCore.prototype.beginStartup=function(p){return new StartupRun(this,p);};
 OrbitCore.prototype.probeStartupProxy=function(proxy){return probeProxy(proxy);};
 OrbitCore.prototype.getStartupDiagnostics=function(profileId){if(profileId)this.get(profileId);return{records:structuredClone(this.state.startupHistory.filter(r=>!profileId||r.profileId===profileId)),warning:this.diagnosticWarning||'',limit:100,perProfileLimit:10};};
 OrbitCore.prototype.clearStartupDiagnostics=function(profileId){this.assertAvailable();if(profileId)this.get(profileId);const previous=this.state.startupHistory;this.state.startupHistory=previous.filter(r=>this.activeStartups.has(r.profileId)&&this.activeStartups.get(r.profileId).record.id===r.id||(profileId&&r.profileId!==profileId));try{this.persist();}catch(e){this.state.startupHistory=previous;throw e;}return{cleared:previous.length-this.state.startupHistory.length};};
}
module.exports={probeProxy,failure,error,initialize,installDiagnostics};
