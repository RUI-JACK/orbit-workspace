'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {launchNative}=require('./native-launch');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
let browserOverride=null;
function setBrowserOverride(dir){if(dir!==null&&(!path.isAbsolute(dir)||!fs.existsSync(path.join(dir,'camoufox.exe'))))throw Error('内核目录无效');browserOverride=dir;}
function browserDir(){return browserOverride||path.join(nativeRoot(),'camoufox');}
let displayDefaults={width:1920,height:1080,scaleFactor:1};
function setDisplayDefaults(display){if(display&&Number.isInteger(display.width)&&display.width>=800&&Number.isInteger(display.height)&&display.height>=600&&Number.isFinite(display.scaleFactor)&&display.scaleFactor>=0.75&&display.scaleFactor<=3)displayDefaults={width:display.width,height:display.height,scaleFactor:display.scaleFactor};return {...displayDefaults};}
function nativeRoot(){const dev=path.join(__dirname,'native-engine');return fs.existsSync(path.join(dev,'camoufox/camoufox.exe'))?dev:path.join(process.resourcesPath||__dirname,'native-engine');}
function engineStatus(){let version='156.0.1-beta.36';try{version=fs.readFileSync(path.join(browserDir(),'application.ini'),'utf8').match(/^Version=(.+)$/m)[1].trim();}catch{}return {available:fs.existsSync(path.join(browserDir(),'camoufox.exe')),name:'Camoufox / Firefox',version};}
function normalizeNative(value={},old={}){
 const integer=(v,d,min,max,label)=>{const n=Number(v??d);if(!Number.isInteger(n)||n<min||n>max)throw Error(label+'超出范围');return n;};
 const one=(v,list,d)=>list.includes(v)?v:d;
 const screenWidth=integer(value.screenWidth,displayDefaults.width,800,7680,'屏幕宽度'),screenHeight=integer(value.screenHeight,displayDefaults.height,600,4320,'屏幕高度');
 const scale=Number(value.deviceScaleFactor??displayDefaults.scaleFactor);if(!Number.isFinite(scale)||scale<0.75||scale>3)throw Error('像素倍率需在 0.75 到 3 之间');
 const fonts=Array.isArray(value.fonts)?[...new Set(value.fonts.map(x=>String(x).trim()).filter(Boolean))].slice(0,150):[];
 if(fonts.some(x=>x.length>100))throw Error('字体名称过长');
 const fontMode=one(value.fontMode,['auto','custom'],'auto');if(fontMode==='custom'&&!fonts.length)throw Error('请填写字体白名单');
 const geoMode=one(value.geoMode,['blocked','proxy','manual'],'blocked');
 const latitude=Number(value.latitude??0),longitude=Number(value.longitude??0);
 if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180)throw Error('经纬度无效');
 const gpuVendor=String(value.gpuVendor??'').trim().slice(0,300),gpuRenderer=String(value.gpuRenderer??'').trim().slice(0,500);
 if(Boolean(gpuVendor)!==Boolean(gpuRenderer))throw Error('自定义 WebGL 需同时填写 Vendor 与 Renderer');
 return {os:one(value.os,['windows','macos','linux'],'windows'),cpuCores:integer(value.cpuCores,0,0,64,'CPU 核数'),screenWidth,screenHeight,deviceScaleFactor:scale,colorDepth:integer(value.colorDepth,24,24,30,'色深'),maxTouchPoints:integer(value.maxTouchPoints,0,0,10,'触摸点数'),canvasMode:one(value.canvasMode,['protected','native'],'protected'),webglMode:one(value.webglMode,['auto','disabled'],'auto'),gpuVendor,gpuRenderer,audioMode:one(value.audioMode,['noise','native'],'noise'),audioSeed:old.audioSeed||crypto.randomInt(1,0xffffffff),sampleRate:integer(value.sampleRate,48000,22050,96000,'音频采样率'),fontMode,fonts,webrtcMode:one(value.webrtcMode,['blocked','proxy','native'],'blocked'),geoMode,latitude,longitude,accuracy:integer(value.accuracy,1000,1,100000,'定位精度'),microphones:integer(value.microphones,1,0,5,'麦克风数量'),webcams:integer(value.webcams,1,0,5,'摄像头数量'),speakers:integer(value.speakers,1,0,5,'扬声器数量'),doNotTrack:value.doNotTrack===true,globalPrivacyControl:value.globalPrivacyControl===true};
}
async function prepareNative(profile,profileDir,overrides={}){
 if(!fs.existsSync(path.join(overrides.browserDir||browserDir(),'camoufox.exe')))throw Error('指纹内核文件缺失，请保留程序文件夹内的 resources/native-engine');
 process.env.CAMOUFOX_FPGEN_DATA=path.join(nativeRoot(),'model');
 const camou=await import('camoufox');
 const f=profile.fingerprint,n=normalizeNative(f.native,f.native),region=profile.lastProxyRegion;
 const config=structuredClone(profile.nativeIdentity?.config||{});
 // launchOptions only fills missing keys; override a saved automation-only value too.
 config.allowAddonNewtab=true;
 for(const k of Object.keys(config))if(k.startsWith('locale:')||k.startsWith('geolocation:')||k.startsWith('webrtc:')||['navigator.language','headers.Accept-Language','addons'].includes(k))delete config[k];
 if(profile.nativeIdentity?.locale!==f.locale)delete config.voices;
 config.timezone=f.timezoneId;
 config['screen.width']=n.screenWidth;config['screen.height']=n.screenHeight;config['screen.availWidth']=n.screenWidth;config['screen.availHeight']=n.screenHeight-40;
 config['screen.colorDepth']=n.colorDepth;config['screen.pixelDepth']=n.colorDepth;
 config['window.devicePixelRatio']=n.deviceScaleFactor;
 config['window.innerWidth']=f.viewport.width;config['window.innerHeight']=f.viewport.height;
 config['window.outerWidth']=f.viewport.width;config['window.outerHeight']=f.viewport.height+86;
 config['window.screenX']=0;config['window.screenY']=0;
 if(n.cpuCores)config['navigator.hardwareConcurrency']=n.cpuCores;
 config['navigator.maxTouchPoints']=n.maxTouchPoints;
 config['navigator.doNotTrack']=n.doNotTrack?'1':'unspecified';config['navigator.globalPrivacyControl']=n.globalPrivacyControl;
 config['audio:seed']=n.audioMode==='noise'?n.audioSeed:0;config['AudioContext:sampleRate']=n.sampleRate;
 config['mediaDevices:enabled']=true;config['mediaDevices:micros']=n.microphones;config['mediaDevices:webcams']=n.webcams;config['mediaDevices:speakers']=n.speakers;
 if(n.fontMode==='custom')config.fonts=n.fonts;
 else if(profile.nativeIdentity?.fontMode==='custom')delete config.fonts;
 if(f.userAgent){if(!/Firefox\/156\./.test(f.userAgent))throw Error('指纹内核的自定义 UA 需使用 Firefox/156.x，以匹配实际浏览器');config['navigator.userAgent']=f.userAgent;config['headers.User-Agent']=f.userAgent;}
 if(n.geoMode!=='blocked'){
  const lat=n.geoMode==='proxy'?region?.latitude:n.latitude,lon=n.geoMode==='proxy'?region?.longitude:n.longitude;
  if(!Number.isFinite(lat)||!Number.isFinite(lon))throw Error('代理定位模式需要代理地区服务返回有效经纬度');
  config['geolocation:latitude']=lat;config['geolocation:longitude']=lon;config['geolocation:accuracy']=n.accuracy;
 }
 if(n.webrtcMode==='proxy'){
  const ip=region?.ip;if(!profile.proxy.server||!ip)throw Error('WebRTC 代理模式需要填写有效代理');
  config[require('node:net').isIP(ip)===6?'webrtc:ipv6':'webrtc:ipv4']=ip;
  config['network:ipv4Only']=require('node:net').isIP(ip)===4;
 }
 const prefs={'network.proxy.allow_hijacking_localhost':true,'permissions.default.geo':n.geoMode==='blocked'?2:1,'permissions.default.camera':2,'permissions.default.microphone':2,'media.navigator.permission.disabled':false,'network.dns.disableIPv6':!!profile.proxy.server,'privacy.baselineFingerprintingProtection.overrides':n.canvasMode==='protected'?'+CanvasImageExtractionPrompt,+CanvasExtractionBeforeUserInputIsBlocked,+CanvasExtractionFromThirdPartiesIsBlocked':''};
 // Interactive environments must allow extension welcome/options/login tabs.
 // Camoufox's automation default rejects tabs.create(), interrupting AdGuard startup.
 // Electron already supplies CSS-pixel display bounds; avoid another PowerShell probe.
 const options=await camou.launchOptions({executable_path:path.join(overrides.browserDir||browserDir(),'camoufox.exe'),os:n.os,config,locale:f.locale,screen:{maxWidth:displayDefaults.width,maxHeight:displayDefaults.height},fingerprint_preset:true,exclude_addons:['UBO'],allow_addon_new_tab:true,block_webrtc:n.webrtcMode==='blocked',block_webgl:n.webglMode==='disabled',...(n.gpuVendor?{webgl_config:[n.gpuVendor,n.gpuRenderer]}:{}),...(profile.proxy.server?{proxy:{server:profile.proxy.server,username:profile.proxy.username||undefined,password:profile.proxy.password||undefined}}:{}),firefox_user_prefs:prefs,headless:overrides.headless??false,main_world_eval:true,enable_cache:true,i_know_what_im_doing:true});
 const chunks=Object.keys(options.env).filter(k=>/^CAMOU_CONFIG_\d+$/.test(k)).sort((a,b)=>Number(a.split('_').pop())-Number(b.split('_').pop()));
 const actual=JSON.parse(chunks.map(k=>options.env[k]).join(''));
 // Keep the configured initial window, but let Firefox measure its live content
 // area. A pinned inner size leaves the old viewport in a larger fullscreen
 // widget. Strip after launchOptions, since presets refill missing values, and
 // on every launch so identities saved by earlier versions migrate as well.
 delete actual['window.innerWidth'];delete actual['window.innerHeight'];
 for(const key of chunks)delete options.env[key];
 const {getEnvVars}=await import('camoufox/dist/utils.js');
 Object.assign(options.env,getEnvVars(actual,{windows:'win',macos:'mac',linux:'lin'}[n.os],options.executablePath));
 const identity={version:overrides.version||engineStatus().version,config:actual,fontMode:n.fontMode,locale:f.locale,generatedAt:profile.nativeIdentity?.generatedAt||new Date().toISOString(),hash:crypto.createHash('sha256').update(JSON.stringify(canonical(actual))).digest('hex').slice(0,16)};
 const launch={...options,user_data_dir:profileDir,viewport:null,colorScheme:f.colorScheme,timeout:45000};
 return {identity,launch:()=>launchNative(launch,actual['navigator.hardwareConcurrency'],()=>camou.Camoufox({persistent_context:true,from_options:launch}))};
}
module.exports={normalizeNative,prepareNative,engineStatus,nativeRoot,setDisplayDefaults,browserDir,setBrowserOverride};
