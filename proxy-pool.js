'use strict';
const crypto=require('node:crypto');
const key=p=>JSON.stringify([new URL(p.server).href,p.username||'',p.password||'']);
function parseProxies(text,validate){
 if(typeof text!=='string'||text.length>1024*1024)throw Error('代理文本过大');
 let lines=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 if(!lines.length||lines.length>1000)throw Error('每次请输入 1–1000 条代理');
 return lines.map((line,i)=>{
  try{
   let proxy;
   if(line.includes('://')){
    const u=new URL(line);const username=decodeURIComponent(u.username),password=decodeURIComponent(u.password);
    u.username='';u.password='';proxy={server:u.href,username,password};
   }else{
    const parts=line.split(':');if(parts.length<2)throw Error();
    proxy={server:'http://'+parts[0]+':'+parts[1],username:parts[2]||'',password:parts.slice(3).join(':')};
   }
   return validate(proxy);
  }catch{throw Error(`第 ${i+1} 行代理格式无效；使用 URL 或 主机:端口:用户名:密码，带认证的 SOCKS 暂不支持`);}
 });
}
function installPool(OrbitCore,cleanProfile){
 const validate=p=>{const proxy=cleanProfile({name:'代理',proxy:p}).proxy;const u=new URL(proxy.server);proxy.server=u.protocol+'//'+u.host;return proxy;};
 OrbitCore.prototype.importProxyPool=function(text){
  this.assertAvailable();const parsed=parseProxies(text,validate),keys=new Set(this.state.proxyPool.map(key));let added=0;
  if(new Set([...keys,...parsed.map(key)]).size>10000)throw Error('代理池最多保存 10000 条代理');
  for(const p of parsed){if(keys.has(key(p)))continue;keys.add(key(p));this.state.proxyPool.push({...p,id:crypto.randomUUID(),createdAt:new Date().toISOString()});added++;}
  this.persist();return{added,duplicates:parsed.length-added};
 };
 OrbitCore.prototype.deleteProxyPool=function(ids){
  this.assertAvailable();this.poolEntries(ids);this.state.proxyPool=this.state.proxyPool.filter(p=>!ids.includes(p.id));this.persist();return true;
 };
 OrbitCore.prototype.poolEntries=function(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>1000)throw Error('请选择 1–1000 条代理');
  return [...new Set(ids)].map(id=>{const p=this.state.proxyPool.find(p=>p.id===id);if(!p)throw Error('代理不存在');return p;});
 };
 OrbitCore.prototype.assignProxyPool=function({proxyIds,profileIds,mode='round-robin'}){
  this.assertAvailable();const proxies=this.poolEntries(proxyIds);
  if(!Array.isArray(profileIds)||!profileIds.length||profileIds.length>1000)throw Error('请选择环境');
  if(!['round-robin','one-to-one'].includes(mode))throw Error('分配方式无效');
  const profiles=[...new Set(profileIds)].map(id=>this.get(id));
  if(profiles.some(p=>this.contexts.has(p.id)||this.busy.has(p.id)||this.automation?.claimed.has(p.id)))throw Error('请先停止所有待分配环境');
  if(mode==='one-to-one'&&proxies.length<profiles.length)throw Error('一对一分配需要不少于环境数量的代理');
  profiles.forEach((p,i)=>{const proxy=proxies[i%proxies.length];p.proxy={server:proxy.server,username:proxy.username,password:proxy.password};delete p.lastProxyRegion;p.updatedAt=new Date().toISOString();});
  this.persist();return{assigned:profiles.length};
 };
 OrbitCore.prototype.checkProxyPool=async function(ids){
  this.assertAvailable();const entries=this.poolEntries(ids);if(entries.length>100)throw Error('每批最多检测 100 条代理');
  this.workspaceBusy='代理检测';this.operationProgress={done:0,total:entries.length};this.emit('changed');let cursor=0;
  try{
   await Promise.all(Array.from({length:Math.min(3,entries.length)},async()=>{
    while(cursor<entries.length){const p=entries[cursor++],started=Date.now();
     try{const region=await this.matchProxy(p);p.check={ok:true,region,latencyMs:Date.now()-started,checkedAt:new Date().toISOString()};}
     catch{p.check={ok:false,error:'无法通过该代理查询出口，请检查地址或认证信息',checkedAt:new Date().toISOString()};}
     this.operationProgress.done++;this.emit('changed');
    }
   }));this.persist();return{checked:entries.length,passed:entries.filter(p=>p.check.ok).length};
  }finally{this.workspaceBusy='';this.operationProgress=null;this.emit('changed');}
 };
}
module.exports={installPool,parseProxies,key};
