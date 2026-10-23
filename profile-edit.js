'use strict';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function object(value,label='参数'){if(!value||typeof value!=='object'||Array.isArray(value))throw Error(label+'应为对象');return value;}
function keys(value,allowed,label='参数'){object(value,label);for(const key of Object.keys(value))if(!allowed.includes(key))throw Error(label+'包含不支持的字段：'+key);}
const nativeKeys=['os','cpuCores','screenWidth','screenHeight','deviceScaleFactor','colorDepth','maxTouchPoints','canvasMode','webglMode','gpuVendor','gpuRenderer','audioMode','sampleRate','fontMode','fonts','webrtcMode','geoMode','latitude','longitude','accuracy','microphones','webcams','speakers','doNotTrack','globalPrivacyControl'];
const enums={engine:['chromium','camoufox'],colorScheme:['light','dark','no-preference'],os:['windows','macos','linux'],canvasMode:['protected','native'],webglMode:['auto','disabled'],audioMode:['noise','native'],fontMode:['auto','custom'],webrtcMode:['blocked','proxy','native'],geoMode:['blocked','proxy','manual']};
function typed(input){
 for(const [k,v] of Object.entries(input)){
  if(enums[k]&&!enums[k].includes(v))throw Error(k+' 的值无效');
  if(['name','group','notes','locale','timezoneId','userAgent','server','username','password','gpuVendor','gpuRenderer'].includes(k)&&typeof v!=='string')throw Error(k+' 应为文本');
  if(['tags','startUrls','fonts'].includes(k)&&(!Array.isArray(v)||v.some(x=>typeof x!=='string')))throw Error(k+' 应为文本数组');
  if(['width','height','cpuCores','screenWidth','screenHeight','deviceScaleFactor','colorDepth','maxTouchPoints','sampleRate','latitude','longitude','accuracy','microphones','webcams','speakers'].includes(k)&&(typeof v!=='number'||!Number.isFinite(v)))throw Error(k+' 应为数字');
  if(['doNotTrack','globalPrivacyControl'].includes(k)&&typeof v!=='boolean')throw Error(k+' 应为布尔值');
 }
}
function validateChanges(changes){
 keys(changes,['name','engine','group','tags','notes','startUrls','proxy','fingerprint']);typed(changes);
 if(own(changes,'proxy')){keys(changes.proxy,['server','username','password'],'代理');typed(changes.proxy);}
 if(own(changes,'fingerprint')){
  const f=changes.fingerprint;keys(f,['locale','timezoneId','userAgent','viewport','colorScheme','native'],'浏览设置');typed(f);
  if(own(f,'viewport')){keys(f.viewport,['width','height'],'视口');typed(f.viewport);}
  if(own(f,'native')){keys(f.native,nativeKeys,'指纹');typed(f.native);}
 }
}
function mergeProfile(profile,changes){
 validateChanges(changes);const merged={...profile,...changes};
 if(changes.proxy)merged.proxy={...profile?.proxy,...changes.proxy};
 if(changes.fingerprint){const f=changes.fingerprint;merged.fingerprint={...profile?.fingerprint,...f};if(f.viewport)merged.fingerprint.viewport={...profile?.fingerprint?.viewport,...f.viewport};if(f.native)merged.fingerprint.native={...profile?.fingerprint?.native,...f.native};}
 return merged;
}
function installEditing(OrbitCore,cleanProfile){
 OrbitCore.prototype.editProfile=function(id,changes){this.assertAvailable();return this.saveProfile(mergeProfile(id?this.get(id):{engine:'camoufox'},changes));};
 OrbitCore.prototype.batchEditProfiles=function({ids,changes}){
  this.assertAvailable();if(!Array.isArray(ids)||!ids.length||ids.length>1000)throw Error('每批请选择 1–1000 个环境');
  keys(changes,['group','tags','tagsMode','notes','startUrls','fingerprint','fingerprintTemplateId'],'批量修改');
  if(!Object.keys(changes).some(k=>k!=='tagsMode'))throw Error('请至少选择一项修改内容');
  if(changes.tagsMode&&!['replace','add','remove'].includes(changes.tagsMode))throw Error('标签修改方式无效');
  if(own(changes,'tagsMode')&&!own(changes,'tags'))throw Error('选择标签方式时需要提供 tags');
  const profiles=[...new Set(ids)].map(id=>this.get(id));
  if(profiles.some(p=>this.contexts.has(p.id)||this.busy.has(p.id)||this.automation?.claimed.has(p.id)))throw Error('请先停止所有选中的环境，再批量编辑');
  const patch=structuredClone(changes);delete patch.tagsMode;delete patch.fingerprintTemplateId;
  if(own(changes,'fingerprintTemplateId')){
   const template=this.get(changes.fingerprintTemplateId);if(template.engine!=='camoufox')throw Error('指纹模板请选择 Camoufox 环境');
   const native=structuredClone(template.fingerprint.native);delete native.audioSeed;
   patch.fingerprint={...patch.fingerprint,native:{...native,...patch.fingerprint?.native}};
  }
  validateChanges(patch);
  const replacements=profiles.map(p=>{
   const merged=mergeProfile(p,patch);
   if(changes.tagsMode==='add')merged.tags=[...new Set([...p.tags,...changes.tags])];
   if(changes.tagsMode==='remove')merged.tags=p.tags.filter(t=>!changes.tags.includes(t));
   if(merged.tags.length>20)throw Error('「'+p.name+'」修改后标签超过 20 个');
   return cleanProfile(merged,p);
  });
  const previous=this.state.profiles;const map=new Map(replacements.map(p=>[p.id,p]));this.state.profiles=previous.map(p=>map.get(p.id)||p);
  try{this.persist();}catch(e){this.state.profiles=previous;throw e;}
  return{updated:replacements.length,ids:replacements.map(p=>p.id)};
 };
}
module.exports={installEditing,mergeProfile,validateChanges};
