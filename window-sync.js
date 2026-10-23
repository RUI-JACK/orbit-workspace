'use strict';
const crypto=require('node:crypto'),A=require('./browser-actions');
// Installs only in the selected master page. Input contents never enter history.
function capture(options){
 const key=options.binding;if(globalThis[key+'Ready'])return;const controller=new AbortController();let timer;globalThis[key+'Ready']={stop(){controller.abort();clearTimeout(timer);}};const listen=(type,handler)=>document.addEventListener(type,handler,{capture:true,signal:controller.signal});
 const select=el=>{if(!(el instanceof Element))return null;if(el.id&&document.querySelectorAll('#'+CSS.escape(el.id)).length===1)return '#'+CSS.escape(el.id);const parts=[];for(let n=el;n&&n.nodeType===1&&parts.length<16;n=n.parentElement){let s=n.localName;if(!s)return null;const siblings=n.parentElement?[...n.parentElement.children].filter(x=>x.localName===n.localName):[];if(siblings.length>1)s+=':nth-of-type('+(siblings.indexOf(n)+1)+')';parts.unshift(s);if(document.querySelectorAll(parts.join(' > ')).length===1)return parts.join(' > ');}return null;};
 const send=data=>{try{globalThis[key](data).catch(()=>{});}catch{}};
 const allowed=el=>options.passwords||!el?.closest('input[type=password]');
 listen('click',e=>{if(!e.isTrusted||e.button!==0||e.detail===0)return;const el=e.composedPath()[0];if(!allowed(el)||el?.closest('select,input[type=checkbox],input[type=radio],input[type=file]'))return;const s=select(el);if(s)send({type:'click',selector:s});},true);
 listen('input',e=>{const el=e.composedPath()[0];if(!e.isTrusted||e.isComposing||!allowed(el)||!el?.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,[contenteditable=true]'))return;const s=select(el);if(s)send({type:'fill',selector:s,value:(el.isContentEditable?el.innerText:el.value).slice(0,20000)});},true);
 listen('compositionend',e=>{const el=e.target;if(!e.isTrusted||!allowed(el))return;const s=select(el);if(s)send({type:'fill',selector:s,value:(el.isContentEditable?el.innerText:el.value||'').slice(0,20000)});},true);
 listen('change',e=>{const el=e.target;if(!e.isTrusted||!allowed(el))return;const s=select(el);if(!s)return;if(el.matches('input[type=checkbox],input[type=radio]'))send({type:'check',selector:s,checked:el.checked});else if(el.matches('select')&&!el.multiple)send({type:'select',selector:s,value:el.value});},true);
 listen('keydown',e=>{if(!e.isTrusted||e.isComposing||!allowed(e.target))return;if(!['Enter','Tab','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key)||e.ctrlKey||e.metaKey||e.altKey)return;const s=select(e.target);if(s)send({type:'press',selector:s,key:(e.shiftKey?'Shift+':'')+e.key});},true);
 listen('scroll',e=>{if(!e.isTrusted)return;clearTimeout(timer);const el=e.target===document?document.scrollingElement:e.target;timer=setTimeout(()=>{if(!el)return;const root=el===document.scrollingElement,s=root?null:select(el);if(root||s)send({type:'scroll',selector:s,x:el.scrollLeft/Math.max(1,el.scrollWidth-el.clientWidth),y:el.scrollTop/Math.max(1,el.scrollHeight-el.clientHeight)});},120);},true);
}
class WindowSync{
 constructor(core){this.core=core;this.session=null;this.bound=new WeakSet();this.last={status:'idle',sent:0,failed:0,errors:[]};}
 get active(){return !!this.session;}
 includes(id){return !!this.session&&(this.session.masterId===id||this.session.targetIds.includes(id));}
 snapshot(){const s=this.session;return {...this.last,active:!!s,paused:!!s?.paused,masterId:s?.masterId||null,targetIds:s?.targetIds||[],tab:s?.tab??0,pending:s?.pending||0};}
 notify(){this.core.emit('changed');}
 async start(input){this.core.assertAvailable();if(this.session)throw Error('请先停止当前同步');if(!input||!Array.isArray(input.targetIds))throw Error('请选择主环境与跟随环境');const ids=[...new Set(input.targetIds)];if(ids.length<1||ids.length>20||ids.includes(input.masterId))throw Error('请选择 1–20 个不同于主环境的跟随环境');const tab=Number(input.tab??0);if(!Number.isInteger(tab)||tab<0||tab>99)throw Error('标签页序号无效');for(const id of [input.masterId,...ids]){this.core.get(id);if(!this.core.contexts.has(id)||this.core.busy.has(id))throw Error('请先启动全部所选环境并等待就绪');if(this.core.recorder?.includes(id))throw Error('所选环境正在录制或点选元素');if(this.core.automation?.claimed.has(id))throw Error('所选环境正在执行自动化任务');}
  const master=this.core.contexts.get(input.masterId).pages()[tab];if(!master)throw Error('主环境中找不到该标签页');if(!/^https?:/.test(master.url()))throw Error('请先在主标签页打开普通网页');const targets=ids.map(id=>({id,page:this.core.contexts.get(id).pages()[tab]}));if(targets.some(t=>!t.page))throw Error('跟随环境中缺少对应序号的标签页');
  const s={masterId:input.masterId,targetIds:ids,master,targets,tab,paused:false,pending:0,tail:Promise.resolve(),binding:'__orbitSync_'+crypto.randomBytes(12).toString('hex'),passwords:input.passwords===true,navigation:input.navigation!==false};this.session=s;this.last={status:'starting',sent:0,failed:0,errors:[]};this.notify();
  try{
   // One page binding per session; the closed session gate rejects all later calls.
   await master.exposeBinding(s.binding,(source,event)=>this.receive(s,source,event));if(this.session!==s)throw Error('已停止');
   const options={binding:s.binding,passwords:s.passwords};s.script=await master.addInitScript(capture,options);
   const onNavigate=frame=>{if(frame===master.mainFrame()&&s.navigation&&/^https?:/.test(frame.url()))this.enqueue(s,{type:'navigate',url:frame.url()},[]);};s.onNavigate=onNavigate;master.on('framenavigated',onNavigate);
   s.onClose=()=>{if(this.session===s)this.stop('主标签页已关闭');};master.on('close',s.onClose);
   if(s.navigation)await Promise.all(targets.map(async t=>{if(t.page.url()!==master.url())await t.page.goto(master.url(),{waitUntil:'domcontentloaded',timeout:20000});}));
   for(const frame of master.frames())await frame.evaluate(capture,options).catch(()=>{});
   if(this.session!==s)throw Error('已停止');this.last.status='running';this.notify();return this.snapshot();
  }catch(e){if(this.session===s)this.stop('同步启动失败，请检查网页是否可访问');throw Error('同步启动失败，请确认目标网页加载正常');}
 }
 receive(s,source,event){if(this.session!==s||s.paused||source.page!==s.master||!event||typeof event!=='object')return;const framePath=[];for(let f=source.frame;f&&f!==s.master.mainFrame();f=f.parentFrame()){const parent=f.parentFrame();if(!parent||framePath.length>=10)return;framePath.unshift(parent.childFrames().indexOf(f));}try{if(event.type==='scroll'){if(![event.x,event.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))return;if(event.selector!==null)A.selector(event.selector);}else A.step(event);this.enqueue(s,event,framePath);}catch{}}
 enqueue(s,event,frames){if(this.session!==s||s.paused)return;if(s.pending>=100){this.last.failed++;this.last.errors=['操作过快，已跳过部分操作'];this.notify();return;}s.pending++;s.tail=s.tail.then(async()=>{if(this.session!==s||s.paused)return;await Promise.all(s.targets.map(async t=>{if(this.session!==s)return;try{if(t.page.isClosed()||!this.core.contexts.has(t.id))throw Error();if(event.type==='navigate'){if(t.page.url()!==event.url)await t.page.goto(A.httpUrl(event.url),{waitUntil:'domcontentloaded',timeout:10000});}
    else{let frame=t.page.mainFrame();for(const n of frames){frame=frame.childFrames()[n];if(!frame)throw Error();}if(event.type==='scroll')await frame.evaluate(({selector,x,y})=>{const el=selector?document.querySelector(selector):document.scrollingElement;if(!el)throw Error();el.scrollTo(x*(el.scrollWidth-el.clientWidth),y*(el.scrollHeight-el.clientHeight));},event);else await A.execute(frame,{...A.step(event),timeout:2500});}
    this.last.sent++;
   }catch{this.last.failed++;this.last.errors=[this.core.get(t.id).name+'：同步未完成，请检查标签页和网页结构'];}}));}).catch(()=>{}).finally(()=>{s.pending--;this.notify();});}
 pause(value){if(!this.session)throw Error('尚未开始同步');this.session.paused=!!value;this.last.status=value?'paused':'running';this.notify();return this.snapshot();}
 stop(reason='已停止同步'){const s=this.session;this.session=null;if(s){if(s.onNavigate)s.master.off('framenavigated',s.onNavigate);if(s.onClose)s.master.off('close',s.onClose);Promise.resolve(s.script?.dispose?.()).catch(()=>{});for(const frame of s.master.frames())frame.evaluate(binding=>{globalThis[binding+'Ready']?.stop();delete globalThis[binding+'Ready'];},s.binding).catch(()=>{});}this.last.status='stopped';this.last.reason=reason;this.notify();return this.snapshot();}
 async close(){const s=this.session;this.stop();await s?.tail;}
}
module.exports={WindowSync,capture};
