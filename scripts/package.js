'use strict';
const path=require('node:path');
(async()=>{
 const fs=require('node:fs');fs.copyFileSync(path.join(__dirname,'../update-runner.js'),path.join(__dirname,'../update-runtime/runner.js'));
 const {packager}=await import('@electron/packager');
 const dirs=await packager({dir:path.join(__dirname,'..'),out:path.join(__dirname,'../dist'),name:'Orbit Workspace',executableName:'Orbit Workspace',icon:path.join(__dirname,'../orbit.ico'),platform:'win32',arch:'x64',electronVersion:'44.9.0',asar:{unpack:'**/*.node'},extraResource:[path.join(__dirname,'../update-runtime'),path.join(__dirname,'../native-engine'),path.join(__dirname,'../docs'),path.join(__dirname,'../orbit.ico'),path.join(__dirname,'../THIRD_PARTY.md')],overwrite:true,prune:true,ignore:[/^\/update-runtime($|\/)/,/^\/\.update-signing($|\/)/,/^\/releases($|\/)/,/^\/installer($|\/)/,/^\/tools($|\/)/,/^\/\.git($|\/)/,/^\/\.env(?:\.|$)/,/^\/native-engine($|\/)/,/^\/backups($|\/)/,/^\/analysis($|\/)/,/^\/verification($|\/)/,/^\/tests($|\/)/,/^\/scripts($|\/)/,/^\/dist($|\/)/,/^\/README\.md$/,/^\/orbit\.ico$/],win32metadata:{CompanyName:'Orbit Local',FileDescription:'Orbit 本地多浏览器环境工作台',ProductName:'Orbit 环境工作台'}});
 console.log(JSON.stringify(dirs));
})().catch(e=>{console.error(e);process.exitCode=1;});

