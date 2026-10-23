'use strict';
const {Readable}=require('node:stream');
function headersOf(values){const headers=new Headers();for(const [key,value]of Object.entries(values||{}))for(const item of Array.isArray(value)?value:[value])headers.append(key,String(item));return headers;}
// net.fetch rejects manual redirects instead of exposing the 3xx response.
// Return one hop via net.request so update-utils can validate each HTTPS URL
// and official-kernel host before following it. Retain Chromium's system proxy
// handling and use a Readable stream for large downloads and cancellation.
function createUpdateFetcher(net){return(url,options={})=>new Promise((resolve,reject)=>{
 let request,response;const signal=options.signal;
 const aborted=()=>signal?.reason||new DOMException('Request aborted','AbortError');
 const stop=()=>{const error=aborted();response?.destroy(error);request?.abort();reject(error);};
 try{
  const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('更新地址仅支持无账号密码的 HTTPS URL');
  if(signal?.aborted)throw aborted();
  request=net.request({url:parsed.href,method:options.method||'GET',redirect:'manual'});
  new Headers(options.headers).forEach((value,key)=>request.setHeader(key,value));
  request.on('redirect',(status,method,target,values)=>{try{const headers=headersOf(values);headers.set('location',target);resolve(new Response(null,{status,headers}));request.abort();}catch(e){reject(e);request.abort();}});
  request.on('response',incoming=>{response=incoming;try{const status=incoming.statusCode,noBody=[204,205,304].includes(status)||options.method==='HEAD';const body=noBody?null:Readable.toWeb(incoming);if(noBody)incoming.resume();resolve(new Response(body,{status,headers:headersOf(incoming.headers)}));}catch(e){incoming.destroy();reject(e);}});
  request.on('error',reject);request.on('close',()=>signal?.removeEventListener('abort',stop));
  signal?.addEventListener('abort',stop,{once:true});request.end();
 }catch(e){request?.abort();reject(e);}
});}
module.exports={createUpdateFetcher};
