'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),asar=require('@electron/asar'),{buildRelease}=require('../scripts/publish-update'),U=require('../update-utils');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-publisher-test-')),source=path.join(root,'source'),stage=path.join(root,'stage'),output=path.join(root,'output');
 const put=(name,text)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
 put('source/package.json',JSON.stringify({name:'publisher-fixture',version:'2.0.0',devDependencies:{electron:'44.9.0'}}));put('source/main.js','module.exports=true;');
 fs.mkdirSync(path.join(stage,'resources'),{recursive:true});await asar.createPackage(source,path.join(stage,'resources/app.asar'));
 put('stage/resources/app.asar.unpacked/fixture.node','fixture');put('stage/resources/docs/readme.md','guide');put('stage/resources/update-runtime/runner.js','fixture runner');
 put('stage/resources/native-engine/private-fixture.txt','must not publish');put('stage/resources/update-runtime/v24.21.0/node.exe','must not publish');put('stage/resources/orbit.ico','not a code-update path');put('stage/resources/THIRD_PARTY.md','not a code-update path');put('stage/profiles/private.txt','must not publish');
 const keys=crypto.generateKeyPairSync('ed25519');put('private.pem',keys.privateKey.export({type:'pkcs8',format:'pem'}));
 const result=await buildRelease(stage,'https://example.com/releases/',{outputRoot:output,keyFile:path.join(root,'private.pem'),archiveUrl:'https://example.com/v2.0.0/update.zip'});
 const manifest=U.verifyAppManifest(JSON.parse(fs.readFileSync(result.manifest,'utf8')),keys.publicKey);assert.equal(manifest.sha256,await U.sha256(result.archive));
 const extracted=path.join(root,'extracted');await U.extract(result.archive,extracted,{appOnly:true});const files=(await U.filesIn(extracted)).map(f=>f.path).sort();
 assert.deepEqual(files,['resources/app.asar','resources/app.asar.unpacked/fixture.node','resources/docs/readme.md','resources/update-runtime/runner.js'].sort());assert.equal(JSON.parse(asar.extractFile(path.join(extracted,'resources/app.asar'),'package.json')).version,'2.0.0');
 assert.equal(fs.readdirSync(output).some(name=>name.startsWith('.release-validation-')),false);
 console.log('PASS signed publisher output accepted by actual client extraction; unrelated resources, native engine, runtime binaries and profiles excluded');
})().catch(e=>{console.error(e);process.exitCode=1;});
