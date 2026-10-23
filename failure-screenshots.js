'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const MAX_IMAGE=8*1024*1024,MAX_TOTAL=100*1024*1024,MAX_COUNT=50;
class FailureScreenshots{
 constructor(core){this.core=core;this.root=path.join(core.dataDir,'automation-screenshots');this.available=new Set();try{fs.mkdirSync(this.root,{recursive:true});this.assertRoot();this.available=new Set(this.files().map(f=>f.id));}catch{}}
 assertRoot(){if(fs.lstatSync(this.root).isSymbolicLink())throw Error('截图目录不能是链接');}
 file(id){if(!ID.test(id||''))throw Error('截图标识无效');this.assertRoot();return path.join(this.root,id+'.shot');}
 files(){this.assertRoot();return fs.readdirSync(this.root).filter(name=>name.endsWith('.shot')&&ID.test(name.slice(0,-5))).flatMap(name=>{const file=path.join(this.root,name),s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink()?[{id:name.slice(0,-5),file,size:s.size,time:s.mtimeMs}]:[];});}
 has(id){return this.available.has(id);}
 remove(id){const file=this.file(id);if(fs.existsSync(file)&&fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink())fs.unlinkSync(file);this.available.delete(id);}
 prune(references){try{for(const f of this.files())if(!references.has(f.id)){try{this.remove(f.id);}catch{}}this.limit();}catch{}}
 limit(){const files=this.files().sort((a,b)=>a.time-b.time);let total=files.reduce((n,f)=>n+f.size,0),count=files.length;for(const f of files){if(total<=MAX_TOTAL&&count<=MAX_COUNT)break;try{this.remove(f.id);total-=f.size;count--;}catch{}}return total<=MAX_TOTAL&&count<=MAX_COUNT;}
 async capture(page,signal){if(signal?.aborted)return {error:'任务已停止'};if(!page||page.isClosed())return {error:'任务页面不存在或已关闭，无法截图'};let id;
  try{if(!this.limit())return {error:'截图空间无法清理，未保存新截图'};const bytes=await page.screenshot({type:'png',fullPage:false,timeout:5000});if(signal?.aborted)return {error:'任务已停止'};if(bytes.length>MAX_IMAGE)return {error:'页面截图超过 8 MB，未保存'};if(!bytes.subarray(0,8).equals(PNG))throw Error();id=crypto.randomUUID();const file=this.file(id),tmp=file+'.tmp';try{fs.writeFileSync(tmp,this.core.codec.encode(bytes.toString('base64')),{flag:'wx'});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}this.available.add(id);if(signal?.aborted){this.remove(id);return {error:'任务已停止'};}if(!this.limit()){this.remove(id);return {error:'截图空间无法清理，未保存新截图'};}return {image:{id,bytes:bytes.length,createdAt:new Date().toISOString()}};
  }catch{if(id)this.available.delete(id);return {error:'页面或本地存储不可用，未能保存截图'};}
 }
 read(id){try{const file=this.file(id),s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>20*1024*1024)throw Error();const decoded=this.core.codec.decode(fs.readFileSync(file)),text=Buffer.isBuffer(decoded)?decoded.toString('utf8'):decoded;if(typeof text!=='string'||text.length>MAX_IMAGE*4/3+8||text.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw Error();const bytes=Buffer.from(text,'base64');if(bytes.length>MAX_IMAGE||!bytes.subarray(0,8).equals(PNG))throw Error();return bytes;}catch{this.available.delete(id);throw Error('截图不存在、已清理或无法解密');}}
}
module.exports={FailureScreenshots,MAX_IMAGE,MAX_TOTAL,MAX_COUNT};
