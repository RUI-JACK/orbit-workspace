'use strict';
const path=require('node:path');
module.exports={
 appId:'com.orbit.localworkspace',productName:'Orbit 环境工作台',executableName:'Orbit Workspace',
 directories:{output:path.join(__dirname,'../releases/installers'),buildResources:__dirname},
 electronVersion:require('../package.json').devDependencies.electron,
 compression:'normal',publish:null,
 win:{target:['nsis'],icon:path.join(__dirname,'../orbit.ico'),signAndEditExecutable:false},
 nsis:{
  guid:'54e69c5a-f5c1-4951-a315-8b49e8984725',
  artifactName:'Orbit-Setup-${version}-win-x64.${ext}',
  oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,
  createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'Orbit 环境工作台',menuCategory:'Orbit 环境工作台',
  runAfterFinish:true,deleteAppDataOnUninstall:false,packElevateHelper:false,
  differentialPackage:false,displayLanguageSelector:true,installerLanguages:['zh_CN','en_US'],language:'2052',
  installerIcon:path.join(__dirname,'../orbit.ico'),uninstallerIcon:path.join(__dirname,'../orbit.ico'),
  include:path.join(__dirname,'installer.nsh'),uninstallDisplayName:'Orbit 环境工作台 ${version}',
 },
};
