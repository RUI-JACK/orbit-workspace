'use strict';
const crypto=require('node:crypto'),A=require('./browser-actions'),C=require('./page-capture');
class WorkflowRecorder{
 constructor(core){this.core=core;this.session=null;this.draft=null;this.selection=null;this.lastReason='';}
 get active(){return !!this.session;}
 includes(id){return this.session?.profileId===id;}
 snapshot(){const s=this.session;return {active:!!s,id:s?.id||null,mode:s?.mode||null,profileId:s?.profileId||null,tab:s?.tab??0,stopping:!!s?.stopping,draft:this.draft?structuredClone(this.draft):null,selection:this.selection?structuredClone(this.selection):null,reason:this.lastReason};}
 notify(){this.core.emit('changed');}
 async start(input){this.core.assertAvailable();if(this.session)throw Error('请先停止当前录制或点选');if(!input||!['record','pick'].includes(input.mode))throw Error('请选择录制或点选模式');const {profileId,mode}=input;this.core.get(profileId);if(this.core.busy.has(profileId)||!this.core.contexts.has(profileId))throw Error('请先启动录制环境并等待网页就绪');if(this.core.sync?.includes(profileId)||this.core.automation?.claimed.has(profileId))throw Error('该环境正在同步或执行任务');const tab=Number(input.tab??0);if(!Number.isInteger(tab)||tab<0||tab>99)throw Error('标签页序号无效');const page=this.core.contexts.get(profileId).pages()[tab];if(!page)throw Error('找不到该标签页');const url=A.httpUrl(page.url());
  const s={id:crypto.randomUUID(),binding:'__orbitCapture_'+crypto.randomBytes(12).toString('hex'),profileId,mode,tab,page,tail:Promise.resolve(),stopping:false};this.session=s;this.selection=null;this.lastReason='';if(mode==='record')this.draft={id:s.id,profileId,steps:[A.step({type:'goto',url})],skipped:0,limited:false};this.notify();
  try{await page.exposeBinding(s.binding,(source,event)=>this.receive(s,source,event));if(this.session!==s)throw Error();const script=C.script({binding:s.binding,mode});s.script=await page.addInitScript({content:script});if(this.session!==s){await this.cleanup(s);throw Error();}
   s.navigate=frame=>{if(frame!==page.mainFrame()||mode!=='record'||s.stopping||!/^https?:/.test(frame.url()))return;const url=frame.url();this.enqueue(s,async()=>{const last=s.lastNavigation;if(last&&Date.now()-last<3000){s.lastNavigation=null;return;}this.append(s,A.step({type:'goto',url}));});};page.on('framenavigated',s.navigate);
   s.closed=()=>{if(this.session===s)this.stop({reason:'选定标签页已关闭'}).catch(()=>{});};page.on('close',s.closed);
   for(const frame of page.frames()){if(this.session!==s)break;await frame.evaluate(script).catch(()=>{});}if(this.session!==s){await this.cleanup(s);throw Error();}await page.bringToFront();if(this.session!==s)throw Error();return this.snapshot();
  }catch{if(this.session===s)await this.stop({reason:'未能开始，请确认网页已经加载'});throw Error('无法开始录制或点选，请确认网页已经加载');}
 }
 enqueue(s,work){if(this.session!==s)return;s.tail=s.tail.then(async()=>{if(this.session===s)await work();}).catch(()=>{if(this.draft?.id===s.id){this.draft.skipped++;this.notify();}});}
 receive(s,source,event){if(this.session!==s||source.page!==s.page||!event||typeof event!=='object')return;this.enqueue(s,async()=>{
  if(event.type==='cancel'){setImmediate(()=>this.stop({reason:'已取消点选'}).catch(()=>{}));return;}
  if(event.type==='skipped'){if(this.draft?.id===s.id){this.draft.skipped++;this.notify();}return;}
  const frames=[];for(let f=source.frame;f&&f!==s.page.mainFrame();f=f.parentFrame()){if(frames.length>=10)throw Error();const handle=await f.frameElement();try{const sel=await handle.evaluate(C.elementSelector);if(!sel)throw Error();frames.unshift(sel);}finally{await handle.dispose();}}
  if(s.mode==='pick'){if(event.type!=='pick')return;this.selection={id:s.id,profileId:s.profileId,selector:A.selector(event.selector),frames};this.notify();setImmediate(()=>this.stop({reason:'已选取网页元素'}).catch(()=>{}));return;}
  if(!['click','fill','press','select','check'].includes(event.type))return;const step=A.step({...event,frames});this.append(s,step);if(event.mayNavigate)s.lastNavigation=Date.now();
 });}
 append(s,step){if(this.session!==s||this.draft?.id!==s.id)return;const steps=this.draft.steps,last=steps.at(-1);if(step.type==='fill'&&last?.type==='fill'&&last.selector===step.selector&&JSON.stringify(last.frames||[])===JSON.stringify(step.frames||[]))steps[steps.length-1]=step;else if(step.type==='goto'&&last?.type==='goto'&&last.url===step.url)return;else if(steps.length<100)steps.push(step);else{this.draft.limited=true;this.notify();setImmediate(()=>this.stop({reason:'已达到 100 步上限'}).catch(()=>{}));return;}this.notify();}
 async cleanup(s){if(s.navigate)s.page.off('framenavigated',s.navigate);if(s.closed)s.page.off('close',s.closed);await Promise.resolve(s.script?.dispose?.()).catch(()=>{});await Promise.all(s.page.frames().map(frame=>frame.evaluate(binding=>{globalThis[binding+'Ready']?.stop();delete globalThis[binding+'Ready'];},s.binding).catch(()=>{})));}
 async stop({discard=false,reason='已停止录制'}={}){const s=this.session;if(s){if(s.stopPromise)return s.stopPromise;s.stopping=true;this.notify();s.stopPromise=(async()=>{await this.cleanup(s);await s.tail;if(this.session===s)this.session=null;if(discard){this.draft=null;this.selection=null;}this.lastReason=reason;this.notify();return this.snapshot();})();return s.stopPromise;}if(discard){this.draft=null;this.selection=null;this.notify();}return this.snapshot();}
 async close(){await this.stop({discard:true});}
}
module.exports={WorkflowRecorder};
