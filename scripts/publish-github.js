'use strict';
// Prepares signed assets locally; remote publication remains an explicit gh command.
const fs=require('node:fs'),path=require('node:path'),{buildRelease}=require('./publish-update'),U=require('../update-utils');
const pkg=require('../package.json'),release=require('../release-config.json');
(async()=>{
 if(!/^[\w.-]+\/[\w.-]+$/.test(release.repository))throw Error('Invalid release repository');
 const tag='v'+pkg.version,file='Orbit-'+pkg.version+'-win32-x64.zip';
 const notes=fs.readFileSync(path.join(__dirname,'../docs/RELEASE_NOTES.md'),'utf8');
 const result=await buildRelease(path.join(__dirname,'../dist/Orbit Workspace-win32-x64'),'https://github.com/'+release.repository+'/releases/download/',{archiveUrl:'https://github.com/'+release.repository+'/releases/download/'+tag+'/'+file,notes});
 U.verifyAppManifest(JSON.parse(fs.readFileSync(result.manifest,'utf8')),require('../update-trust.json').publicKey);
 console.log(JSON.stringify({...result,tag,feed:release.appFeed}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
