'use strict';
const {firefox}=require('playwright-core');
let nativeApi,initializationError,launchQueue=Promise.resolve();
function affinityApi(){
 if(nativeApi!==undefined)return nativeApi;
 nativeApi=null;
 if(process.platform!=='win32'||process.arch!=='x64')return nativeApi;
 try{
  const koffi=require('koffi'),kernel=koffi.load('kernel32.dll');
  const current=kernel.func('void * __stdcall GetCurrentProcess()');
  const read=kernel.func('int __stdcall GetProcessAffinityMask(void * process, _Out_ uintptr_t * mask, _Out_ uintptr_t * system)');
  const write=kernel.func('int __stdcall SetProcessAffinityMask(void * process, uintptr_t mask)');
  const open=kernel.func('void * __stdcall OpenProcess(uint32_t rights, int inherit, uint32_t pid)');
  const close=kernel.func('int __stdcall CloseHandle(void * handle)');
  const get=handle=>{const mask=[0n],system=[0n];if(!read(handle,mask,system)||!mask[0])throw Error('无法读取浏览器启动进程的 CPU 分配');return BigInt(mask[0]);};
  nativeApi={get:()=>get(current()),set:mask=>{if(!write(current(),mask))throw Error('无法设置浏览器启动进程的 CPU 分配');},getForProcess:pid=>{const handle=open(0x1000,0,pid);if(!handle)throw Error('无法检查浏览器进程');try{return get(handle);}finally{close(handle);}}};
  nativeApi.get();
 }catch(e){initializationError=e.message;nativeApi=null;}
 return nativeApi;
}
function withLaunchLock(operation){const result=launchQueue.then(operation,operation);launchQueue=result.catch(()=>{});return result;}
function maskCores(mask){const result=[];for(let i=0;i<64;i++)if(mask&(1n<<BigInt(i)))result.push(i);return result;}
async function launchNative(fromOptions,cpuCores,fallback){
 return withLaunchLock(async()=>{
  const api=affinityApi();if(!api)return fallback();
  const before=api.get(),cores=maskCores(before);
  const count=Number.isInteger(cpuCores)&&cpuCores>0?cpuCores:cores.length;
  let changed=false,context;
  try{
   if(count<cores.length){const start=Math.floor(Math.random()*cores.length);let mask=0n;for(let i=0;i<count;i++)mask|=1n<<BigInt(cores[(start+i)%cores.length]);api.set(mask);changed=true;}
   const {user_data_dir,...options}=fromOptions;
   // Match Camoufox's persistent-context media defaults and no-viewport behavior.
   context=await firefox.launchPersistentContext(user_data_dir,{reducedMotion:null,forcedColors:null,contrast:null,...options});
   return context;
  }finally{
   if(changed){try{api.set(before);}catch(e){await context?.close().catch(()=>{});throw e;}}
  }
 });
}
function backendStatus(){return{native:!!affinityApi(),...(initializationError?{error:initializationError}:{})};}
module.exports={launchNative,withLaunchLock,affinityApi,maskCores,backendStatus};
