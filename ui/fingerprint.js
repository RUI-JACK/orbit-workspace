'use strict';
(()=>{
 const root=document.querySelector('#profile-dialog .dialog-content');
 const option=(value,label)=>`<option value="${value}">${label}</option>`;
 const select=(name,label,values)=>`<label class="field">${label}<select name="${name}">${values.map(x=>option(...x)).join('')}</select></label>`;
 const number=(name,label,min,max,step=1)=>`<label class="field">${label}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}"></label>`;
 const text=(name,label,placeholder='')=>`<label class="field">${label}<input name="${name}" placeholder="${placeholder}"></label>`;
 root.insertAdjacentHTML('afterbegin',`<label class="field">浏览器内核<select name="engine" id="profile-engine"><option value="camoufox">Camoufox · 原生指纹配置</option><option value="chromium">本机 Chrome / Edge · 基础隔离</option></select><small>切换内核会使用各自独立的登录数据。旧环境仍保留原来的内核和浏览数据。</small></label>`);
 const panel=document.createElement('section');panel.id='native-fingerprint-settings';
 panel.innerHTML=`<h3 class="form-section">指纹配置 <span id="native-engine-state">Camoufox · Firefox 156</span></h3><p class="help">首次启动生成并保存一套设备参数，重开时沿用。代理地区在启动时自动同步，无需勾选。新环境默认使用本机 Windows 类型。</p><p class="help" id="display-default-hint"></p><div class="form-grid">`+
 select('fpOs','系统类型',[['windows','Windows'],['macos','macOS（模拟）'],['linux','Linux（模拟）']])+
 select('fpCores','CPU 逻辑核数',[['0','自动生成并固定'],...['2','4','6','8','12','16','24','32','64'].map(x=>[x,x+' 核'])])+
 number('fpScreenWidth','屏幕宽度',800,7680)+number('fpScreenHeight','屏幕高度',600,4320)+number('fpScale','设备像素倍率',0.75,3,0.25)+
 select('fpColorDepth','屏幕色深',[['24','24 bit'],['30','30 bit']])+number('fpTouch','最大触摸点数',0,10)+
 select('fpCanvas','Canvas / 图像读取',[['protected','隐私保护（原生限制读取）'],['native','使用真实渲染结果']])+
 select('fpWebgl','WebGL',[['auto','设备配置自动生成'],['disabled','禁用（部分网页不可用）']])+
 text('fpGpuVendor','WebGL Vendor（可选）','留空由内核生成')+text('fpGpuRenderer','WebGL Renderer（可选）','需与 Vendor 组成内核支持的 GPU 配对')+
 select('fpAudio','音频指纹',[['noise','每个环境固定音频种子'],['native','原生音频，不加扰动']])+
 select('fpSampleRate','AudioContext 采样率',[['44100','44100 Hz'],['48000','48000 Hz']])+
 select('fpFontMode','可见字体',[['auto','按设备配置自动生成'],['custom','自定义字体白名单']])+`<label class="field full">字体白名单<textarea name="fpFonts" rows="2" placeholder="每行一个字体名称，例如 Arial"></textarea><small>白名单只控制字体暴露；缺少的实体字体不能凭名称生成。</small></label>`+
 select('fpWebrtc','WebRTC',[['blocked','禁用（默认，限制网络直连）'],['proxy','报告代理出口 IP'],['native','原生模式（可能暴露本地网络）']])+
 select('fpGeo','网页定位',[['blocked','阻止定位（默认）'],['proxy','使用代理 IP 的近似位置'],['manual','指定经纬度']])+
 number('fpLatitude','纬度',-90,90,0.000001)+number('fpLongitude','经度',-180,180,0.000001)+number('fpAccuracy','定位精度 / 米',1,100000)+
 number('fpMicrophones','报告麦克风数量',0,5)+number('fpWebcams','报告摄像头数量',0,5)+number('fpSpeakers','报告扬声器数量',0,5)+
 select('fpDnt','Do Not Track',[['false','关闭'],['true','开启']])+select('fpGpc','Global Privacy Control',[['false','关闭'],['true','开启']])+`</div><p class="fingerprint-boundary">Canvas 保护可能影响图像导出；系统/GPU 模拟不等于拥有对应硬件。设备列表不会创造可用的摄像头或麦克风，实际采集权限默认阻止。内核没有 navigator.deviceMemory 时保留缺省行为。字体、Emoji、WebGPU、TLS 等仍有平台边界，不保证通过所有指纹或反关联检测。</p>`;
 root.append(panel);
 const form=document.querySelector('#profile-form');
 const mapping={os:'fpOs',cpuCores:'fpCores',screenWidth:'fpScreenWidth',screenHeight:'fpScreenHeight',deviceScaleFactor:'fpScale',colorDepth:'fpColorDepth',maxTouchPoints:'fpTouch',canvasMode:'fpCanvas',webglMode:'fpWebgl',gpuVendor:'fpGpuVendor',gpuRenderer:'fpGpuRenderer',audioMode:'fpAudio',sampleRate:'fpSampleRate',fontMode:'fpFontMode',webrtcMode:'fpWebrtc',geoMode:'fpGeo',latitude:'fpLatitude',longitude:'fpLongitude',accuracy:'fpAccuracy',microphones:'fpMicrophones',webcams:'fpWebcams',speakers:'fpSpeakers',doNotTrack:'fpDnt',globalPrivacyControl:'fpGpc'};
 const defaults={os:'windows',cpuCores:0,screenWidth:1920,screenHeight:1080,deviceScaleFactor:1,colorDepth:24,maxTouchPoints:0,canvasMode:'protected',webglMode:'auto',gpuVendor:'',gpuRenderer:'',audioMode:'noise',sampleRate:48000,fontMode:'auto',fonts:[],webrtcMode:'blocked',geoMode:'blocked',latitude:0,longitude:0,accuracy:1000,microphones:1,webcams:1,speakers:1,doNotTrack:false,globalPrivacyControl:false};
 const numeric=new Set(['cpuCores','screenWidth','screenHeight','deviceScaleFactor','colorDepth','maxTouchPoints','sampleRate','latitude','longitude','accuracy','microphones','webcams','speakers']);
 function sync(){panel.hidden=form.elements.engine.value!=='camoufox';panel.querySelectorAll('input,select,textarea').forEach(e=>{e.disabled=panel.hidden;});form.elements.userAgent.placeholder=panel.hidden?'留空使用浏览器默认 UA':'留空自动生成 Firefox 156 UA';}
 form.elements.engine.addEventListener('change',sync);
 const dialog=document.createElement('dialog');dialog.id='fingerprint-report';dialog.innerHTML='<div class="dialog-head"><h2>实际指纹观测</h2><button type="button" class="icon-btn" id="close-fingerprint-report">×</button></div><div class="dialog-content"><p class="help">从当前环境的新空白页读取，不访问外部检测网站。</p><div id="fp-report-summary"></div><pre id="fp-report-json"></pre></div><div class="dialog-footer"><button class="btn" id="copy-fingerprint-report">复制报告</button></div>';document.body.append(dialog);
 document.querySelector('#close-fingerprint-report').onclick=()=>dialog.close();let lastReport='';document.querySelector('#copy-fingerprint-report').onclick=()=>window.orbit.copyText(lastReport);
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 window.fpEditor={
  setDisplay(display){if(!display)return;defaults.screenWidth=display.width;defaults.screenHeight=display.height;defaults.deviceScaleFactor=display.scaleFactor;document.querySelector('#display-default-hint').textContent=`新环境默认使用当前显示器：${display.width} × ${display.height}，像素倍率 ${display.scaleFactor}（物理分辨率 ${display.physicalWidth} × ${display.physicalHeight}）。`;},
  fill(profile){const n={...defaults,...profile?.fingerprint?.native};form.elements.engine.value=profile?.engine|| (profile?'chromium':'camoufox');for(const [key,name]of Object.entries(mapping))form.elements[name].value=String(n[key]);form.elements.fpFonts.value=(n.fonts||[]).join('\n');sync();},
  read(){const n={};for(const [key,name]of Object.entries(mapping)){const v=form.elements[name].value;n[key]=numeric.has(key)?Number(v):['doNotTrack','globalPrivacyControl'].includes(key)?v==='true':v;}n.fonts=form.elements.fpFonts.value.split(/[\n,，]/).map(x=>x.trim()).filter(Boolean);return n;},
  setAvailability(status){document.querySelector('#native-engine-state').textContent=status?.available?'已安装 · '+status.version:'内核文件缺失';},
  showReport(report){lastReport=JSON.stringify(report,null,2);document.querySelector('#fp-report-json').textContent=lastReport;const v=report.observed;document.querySelector('#fp-report-summary').textContent=`${report.engine==='camoufox'?'Camoufox':'Chrome / Edge'} · ${v.platform} · ${v.cpuCores} 核 · ${v.screen.width} × ${v.screen.height} · ${v.language} · ${v.timezone}`;dialog.showModal();}
 };
})();
