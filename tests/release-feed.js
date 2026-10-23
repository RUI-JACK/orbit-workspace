'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {OrbitCore}=require('../core'),{UpdateManager}=require('../update-manager'),feed=require('../release-config.json').appFeed;
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-feed-')),core=new OrbitCore(root);let m=new UpdateManager(core);
 assert.equal(m.snapshot().settings.appFeed,feed);await m.saveSettings({autoCheck:false,autoDownload:false});m.close();
 const file=path.join(root,'updates/state.dat'),old=JSON.parse(fs.readFileSync(file,'utf8'));delete old.appFeedDefaultInitialized;old.settings.appFeed='';fs.writeFileSync(file,JSON.stringify(old));
 m=new UpdateManager(core);assert.equal(m.snapshot().settings.appFeed,feed);assert.equal(m.snapshot().settings.autoCheck,false);assert.equal(m.snapshot().settings.autoDownload,false);
 await m.saveSettings({appFeed:''});m.close();m=new UpdateManager(core);assert.equal(m.snapshot().settings.appFeed,'');
 await m.saveSettings({appFeed:'https://example.com/custom.json'});m.close();m=new UpdateManager(core);assert.equal(m.snapshot().settings.appFeed,'https://example.com/custom.json');m.close();await core.shutdown();
 console.log('PASS new default, old blank migration, explicit opt-out and custom feed preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
