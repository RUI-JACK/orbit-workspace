'use strict';
const http=require('node:http'),crypto=require('node:crypto');
class ApiError extends Error{constructor(status,code,message){super(message);Object.assign(this,{status,code});}}
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
function publicProfile(p){const copy=structuredClone(p);delete copy.nativeIdentity;delete copy.lastProxyRegion;if(copy.proxy)delete copy.proxy.password;return copy;}
async function body(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'CONTENT_TYPE','请求需要 application/json');
 let size=0;const chunks=[];for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>2*1024*1024)fail(413,'BODY_TOO_LARGE','请求体最多 2 MB');chunks.push(chunk);}
 try{const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'),(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))throw Error();return value;});if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed;}catch{fail(400,'INVALID_JSON','请求体需要有效的 JSON 对象');}
}
function send(res,status,data){if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
class LocalApi{
 constructor(core){this.core=core;this.server=null;this.port=null;this.active=0;this.changing=false;}
 status(){return{enabled:!!this.server,port:this.port||this.core.state.settings.apiPort,hasToken:!!this.core.state.apiToken,error:this.core.apiError||''};}
 async configure(enabled,port){
  if(this.changing)throw Error('API 设置正在保存，请稍后');this.changing=true;
  try{
   if(enabled&&this.server&&this.port===port)return;
   let next=null;
   if(enabled){
    next=http.createServer((req,res)=>this.handle(req,res));next.requestTimeout=15000;next.headersTimeout=10000;next.keepAliveTimeout=2000;
    next.on('clientError',(_,socket)=>{if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
    try{await new Promise((resolve,reject)=>{const bad=e=>{next.removeListener('listening',good);reject(e);};const good=()=>{next.removeListener('error',bad);resolve();};next.once('error',bad);next.once('listening',good);next.listen({host:'127.0.0.1',port,exclusive:true});});}
    catch{throw Error('无法监听本机端口 '+port+'，请检查端口是否已被占用');}
    next.on('error',()=>{this.core.apiError='本地 API 监听发生错误，请重新保存设置';this.core.emit('changed');});
   }
   const old=this.server;this.server=next;this.port=enabled?port:null;this.core.apiError='';
   if(old)await new Promise(r=>{old.close(r);old.closeIdleConnections();});
  }finally{this.changing=false;}
 }
 async close(){await this.configure(false,this.core.state.settings.apiPort);}
 async handle(req,res){
  let counted=false;
  try{
   const address=req.socket.localPort;
   if(req.headers.host!==`127.0.0.1:${address}`||req.headers.origin!==undefined||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!req.url.startsWith('/')||req.url.startsWith('//'))fail(403,'LOCAL_ONLY','仅接受本机脚本请求');
   const supplied=req.headers.authorization||'',expected='Bearer '+this.core.state.apiToken;
   if(Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))fail(401,'UNAUTHORIZED','缺少或无效的 Bearer 令牌');
   if(this.active>=8)fail(429,'BUSY','同时最多处理 8 个请求');this.active++;counted=true;
   const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname,method=req.method;let data;
   const b=()=>body(req),idFrom=()=>url.searchParams.get('id');
   if(method==='GET'&&route==='/api/v1/status')data={version:this.core.snapshot().version,profiles:this.core.state.profiles.length,running:this.core.contexts.size};
   else if(method==='GET'&&route==='/api/v1/profiles')data=this.core.snapshot().profiles.map(publicProfile);
   else if(method==='POST'&&route==='/api/v1/profiles'){const input=await b(),{id,...changes}=input;data=publicProfile(this.core.editProfile(id,changes));}
   else if(method==='POST'&&route==='/api/v1/profiles/batch-edit'){data=this.core.batchEditProfiles(await b());}
   else if(/^\/api\/v1\/profiles\/[0-9a-f-]{36}$/.test(route)){
    const id=route.split('/').pop();
    if(!this.core.state.profiles.some(p=>p.id===id))fail(404,'NOT_FOUND','找不到该环境');
    if(method==='GET')data=publicProfile(this.core.snapshot().profiles.find(p=>p.id===id));
    else if(method==='PATCH')data=publicProfile(this.core.editProfile(id,await b()));
    else if(method==='DELETE'){this.core.deleteProfiles([id]);data={deleted:1};}
    else fail(405,'METHOD','该路径不支持此请求方式');
   }
   else if(method==='POST'&&['/api/v1/browser/start','/api/v1/browser/stop'].includes(route)){
    const {id}=await b();if(route.endsWith('/start'))await this.core.start(id);else await this.core.stop(id);data={id,running:this.core.contexts.has(id)};
   }
   else if(method==='GET'&&route==='/api/v1/browser/cookies')data=await this.core.getCookies(idFrom());
   else if(method==='POST'&&route==='/api/v1/browser/cookies'){const {id,cookies}=await b();data={imported:await this.core.importCookies(id,cookies)};}
   else if(method==='GET'&&route==='/api/v1/browser/tabs'){
    const context=this.context(idFrom());data=await Promise.all(context.pages().map(async(page,index)=>({index,url:page.url(),title:await page.title().catch(()=>'')})));
   }
   else if(method==='POST'&&['/api/v1/browser/navigate','/api/v1/browser/click','/api/v1/browser/fill','/api/v1/browser/evaluate'].includes(route)){
    this.core.assertAvailable();const input=await b(),page=this.page(input.id,input.tab);
    try{
     if(route.endsWith('/navigate')){let target;try{target=new URL(input.url);}catch{fail(400,'URL','网址无效');}if(!['http:','https:'].includes(target.protocol))fail(400,'URL','只允许 HTTP/HTTPS 网址');await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:30000});data={url:page.url()};}
     else if(route.endsWith('/click')){if(typeof input.selector!=='string')fail(400,'SELECTOR','需要 selector');await page.locator(input.selector).click({timeout:10000});data={clicked:true};}
     else if(route.endsWith('/fill')){if(typeof input.selector!=='string'||typeof input.value!=='string')fail(400,'INPUT','需要 selector 和文本 value');await page.locator(input.selector).fill(input.value,{timeout:10000});data={filled:true};}
     else {if(typeof input.expression!=='string'||input.expression.length>65536)fail(400,'EXPRESSION','expression 应为不超过 64 KB 的网页 JavaScript 表达式');const p=this.core.get(input.id);const evaluation=page.evaluate(p.engine==='camoufox'?'mw:('+input.expression+')':input.expression);let timer;try{data=await Promise.race([evaluation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),10000);})]);}finally{clearTimeout(timer);}}
    }catch(e){if(e instanceof ApiError)throw e;fail(400,'PAGE_ACTION','网页操作失败，请检查标签页、选择器或表达式');}
   }
   else if(method==='GET'&&route==='/api/v1/browser/screenshot'){
    const page=this.page(idFrom(),Number(url.searchParams.get('tab')||0));const png=await page.screenshot({fullPage:url.searchParams.get('fullPage')==='true',timeout:15000});res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(png);return;
   }
   else fail(404,'NOT_FOUND','接口不存在');
   send(res,200,{ok:true,data:data??null});
  }catch(e){
   let status=e.status||400,code=e.code||'REQUEST_FAILED',message=e.message;
   if(!e.status&&(/正在|请先停止/.test(message))){status=409;code='CONFLICT';}
   if(!e.status&&(/找不到|不存在/.test(message))){status=404;code='NOT_FOUND';}
   if(!e.status&&(/Call log:|\n|[A-Z]:\\/.test(message))){message='请求未完成，请检查参数和环境状态';code='REQUEST_FAILED';}
   send(res,status,{ok:false,error:{code,message}});
  }finally{if(counted)this.active--;req.resume();}
 }
 context(id){this.core.get(id);const context=this.core.contexts.get(id);if(!context)fail(409,'NOT_RUNNING','请先启动环境');return context;}
 page(id,tab=0){if(!Number.isInteger(tab)||tab<0)fail(400,'TAB','tab 应为非负整数');const context=this.context(id),page=context.pages()[tab];if(!page)fail(404,'TAB','找不到标签页');return page;}
}
module.exports={LocalApi,publicProfile};
