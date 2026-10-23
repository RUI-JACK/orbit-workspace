'use strict';
// Prepare the official hash-pinned model before launching the desktop app.
// Copy verified files directly: some Windows storage filters reject rename with EXDEV.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
(async()=>{
 const base=path.dirname(require.resolve('camoufox'));
 const {MODEL_PIN}=await import(require('node:url').pathToFileURL(path.join(base,'fpgen/pin.js')));
 const {modelDir,verifyArchive}=await import(require('node:url').pathToFileURL(path.join(base,'fpgen/model.js')));
 const response=await fetch(MODEL_PIN.url);if(!response.ok)throw Error('Model download HTTP '+response.status);
 const archive=Buffer.from(await response.arrayBuffer());verifyArchive(archive);
 const zip=new (require('adm-zip'))(archive),dir=modelDir();fs.mkdirSync(dir,{recursive:true});
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 for(const name of MODEL_PIN.files){const bytes=zip.getEntry(name).getData();if(hash(bytes)!==MODEL_PIN.file_sha256[name])throw Error('Invalid model member '+name);fs.writeFileSync(path.join(dir,name),bytes);}
 const values=zlib.zstdDecompressSync(fs.readFileSync(path.join(dir,'values.dat.zst')));if(hash(values)!==MODEL_PIN.decompressed_sha256['values.dat'])throw Error('Invalid decompressed model');fs.writeFileSync(path.join(dir,'values.dat'),values);fs.writeFileSync(path.join(dir,'.pinned-model'),MODEL_PIN.sha256+'\n');console.log('Verified model prepared: '+dir);
})().catch(e=>{console.error(e);process.exitCode=1;});
