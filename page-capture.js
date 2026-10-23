'use strict';
// These two functions are serialized into the selected browser document.
function elementSelector(el){
 if(!(el instanceof Element)||el.getRootNode()!==document)return null;
 const unique=s=>{try{return document.querySelectorAll(s).length===1;}catch{return false;}};
 if(el.id){const s='#'+CSS.escape(el.id);if(unique(s))return s;}
 for(const attr of ['data-testid','data-test','name','aria-label']){const value=el.getAttribute(attr);if(value&&value.length<200){const s=el.localName+'['+attr+'='+JSON.stringify(value)+']';if(unique(s))return s;}}
 const parts=[];for(let n=el;n&&n.nodeType===1&&parts.length<20;n=n.parentElement){let s=n.localName;if(!s)return null;const siblings=n.parentElement?[...n.parentElement.children].filter(x=>x.localName===n.localName):[];if(siblings.length>1)s+=':nth-of-type('+(siblings.indexOf(n)+1)+')';parts.unshift(s);const path=parts.join(' > ');if(unique(path))return path;}return null;
}
function installCapture(options,select){
 const key=options.binding+'Ready';if(globalThis[key])return;const controller=new AbortController(),signal=controller.signal;
 let host,outline,preview;const send=event=>{try{globalThis[options.binding](event).catch(()=>{});}catch{}};
 const listen=(name,fn)=>document.addEventListener(name,fn,{capture:true,signal});
 const target=e=>{const el=e.composedPath()[0];if(!(el instanceof Element)||el===host||host?.contains(el))return null;return el.closest('input,textarea,select,button,a,[role=button],[contenteditable=true]')||el;};
 const privateField=el=>!!el?.closest('input[type=password],input[type=file]');
 globalThis[key]={stop(){controller.abort();host?.remove();}};
 if(options.mode==='pick'){
  host=document.createElement('orbit-element-picker');host.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const shadow=host.attachShadow({mode:'closed'});outline=document.createElement('div');outline.style.cssText='position:fixed;border:2px solid #7861d0;background:rgba(120,97,208,.1);box-sizing:border-box;display:none;';shadow.append(outline);
  if(window===window.top){preview=document.createElement('div');preview.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);max-width:80vw;padding:12px 18px;border-radius:8px;background:#302d43;color:white;font:13px sans-serif;box-shadow:0 4px 18px #0003;overflow-wrap:anywhere;';preview.textContent='点击网页元素以选择 · Esc 取消 · 此次点击不会执行';shadow.append(preview);}
  (document.documentElement||document).append(host);
  listen('mousemove',e=>{const el=target(e);if(!el)return;const r=el.getBoundingClientRect();outline.style.display='block';outline.style.left=r.left+'px';outline.style.top=r.top+'px';outline.style.width=r.width+'px';outline.style.height=r.height+'px';if(preview)preview.textContent=(select(el)||'此元素暂不支持')+' · 点击选择 / Esc 取消';});
  for(const type of ['pointerdown','mousedown','pointerup','mouseup'])listen(type,e=>{if(!e.isTrusted||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();});
  listen('click',e=>{if(!e.isTrusted||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();const el=target(e),selector=el&&select(el);if(selector)send({type:'pick',selector});else send({type:'skipped'});});
  listen('keydown',e=>{if(e.isTrusted&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();send({type:'cancel'});}});
  return;
 }
 const payload=(el,type,other={})=>{const selector=select(el);if(selector)send({type,selector,...other});else send({type:'skipped'});};
 listen('click',e=>{if(!e.isTrusted||e.button!==0||e.detail===0)return;const el=target(e);if(!el||privateField(el))return;
  // Camoufox can deliver an iframe input click without moving focus. Restore
  // the standard text-field focus only while recording, after page handlers.
  if(window!==window.top&&el.matches('input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable=true]'))setTimeout(()=>{if(!signal.aborted&&!e.defaultPrevented&&el.isConnected&&!el.disabled&&document.activeElement!==el)el.focus({preventScroll:true});},0);
  if((el.matches('input,textarea,select,[contenteditable=true]')&&!el.matches('input[type=submit],input[type=button],input[type=reset],input[type=image]'))||el.closest('label')?.control?.matches('input[type=checkbox],input[type=radio]'))return;const mayNavigate=!!(el.closest('a[href]')||el.closest('button,input[type=submit]')?.form);payload(el,'click',{mayNavigate});});
 listen('input',e=>{if(!e.isTrusted||e.isComposing)return;const el=target(e);if(!el)return;if(privateField(el)){send({type:'skipped'});return;}if(el.matches('input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable=true]'))payload(el,'fill',{value:String(el.isContentEditable?el.innerText:el.value).slice(0,20000)});});
 listen('compositionend',e=>{if(!e.isTrusted)return;const el=target(e);if(!el||privateField(el)||!el.matches('input,textarea,[contenteditable=true]'))return;payload(el,'fill',{value:String(el.isContentEditable?el.innerText:el.value||'').slice(0,20000)});});
 listen('change',e=>{if(!e.isTrusted)return;const el=target(e);if(!el)return;if(privateField(el)){send({type:'skipped'});return;}if(el.matches('input[type=checkbox],input[type=radio]'))payload(el,'check',{checked:el.checked});else if(el.matches('select')&&!el.multiple)payload(el,'select',{value:el.value});else if(el.matches('input,textarea'))payload(el,'fill',{value:String(el.value).slice(0,20000)});});
 listen('keydown',e=>{if(!e.isTrusted||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;const el=target(e);if(!el||privateField(el)||el.matches('select'))return;const key=e.key===' '?'Space':e.key;if(!['Enter','Tab','Escape','Space'].includes(key)||key==='Space'&&el.matches('input,textarea,[contenteditable=true]'))return;payload(el,'press',{key:(e.shiftKey?'Shift+':'')+key,mayNavigate:key==='Enter'&&!!el.closest('form')});});
}
function script(options){return '('+installCapture.toString()+')('+JSON.stringify(options)+','+elementSelector.toString()+')';}
module.exports={elementSelector,script};
