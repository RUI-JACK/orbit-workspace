'use strict';
(()=>{
 const dialog=document.createElement('dialog');dialog.id='batch-edit-dialog';let ids=[];
 const input=(name,type='text',more='')=>`<input name="batch_${name}" type="${type}" ${more}>`;
 const select=(name,options)=>`<select name="batch_${name}">${options.map(([v,label])=>`<option value="${v}">${label}</option>`).join('')}</select>`;
 const row=(key,label,content)=>`<section class="batch-field"><label class="batch-toggle"><input type="checkbox" data-edit-field="${key}"> ${label}</label><fieldset data-field-content="${key}" disabled>${content}</fieldset></section>`;
 dialog.innerHTML=`<form id="batch-edit-form"><div class="dialog-head"><div><div class="eyebrow">BULK EDIT</div><h2>批量编辑环境</h2></div><button type="button" class="icon-btn" id="batch-edit-close" aria-label="关闭">×</button></div><div class="dialog-content"><p id="batch-edit-summary" class="help"></p><p class="batch-boundary">只修改勾选的字段，其余保持原样。所选环境需全部停止；任一参数无效时，整批不会保存。</p>`+
 row('group','分组',input('group','text','maxlength="100" placeholder="留空归入未分组"'))+
 row('tags','标签',select('tagsMode',[['replace','替换全部标签'],['add','追加标签'],['remove','移除指定标签']])+input('tags','text','placeholder="逗号分隔；替换时留空可清空"'))+
 row('startUrls','启动页面','<textarea name="batch_startUrls" rows="2" placeholder="每行一个网址；留空默认打开 Google"></textarea>')+
 row('notes','备注','<textarea name="batch_notes" rows="2" maxlength="3000" placeholder="留空清空备注"></textarea>')+
 row('locale','浏览器语言',input('locale','text','placeholder="en-US / zh-CN / ja-JP"'))+
 row('timezoneId','时区',input('timezoneId','text','placeholder="America/Los_Angeles / Asia/Tokyo"'))+
 row('viewport','窗口视口尺寸',`<label>宽度 ${input('width','number','min="480" max="3840"')}</label><label>高度 ${input('height','number','min="360" max="2160"')}</label>`)+
 row('colorScheme','配色模式',select('colorScheme',[['light','浅色'],['dark','深色'],['no-preference','跟随浏览器']]))+
 row('userAgent','User-Agent',input('userAgent','text','placeholder="留空恢复内核默认 UA"'))+
 `<h3 class="form-section">Camoufox 指纹设置 <span>不切换浏览器内核</span></h3>`+
 row('template','从已有环境复制原生指纹设置',select('templateId',[])+`<p class="help">复制系统、屏幕、Canvas、WebGL、字体等配置；保留各环境的音频种子，不复制生成的设备身份。语言、时区和窗口尺寸由上面的选项决定。下方单项设置优先。</p>`)+
 row('cpuCores','CPU 逻辑核数',select('cpuCores',[['0','自动生成并固定'],...['2','4','6','8','12','16','24','32','64'].map(x=>[x,x+' 核'])]))+
 row('screen','屏幕与像素倍率',`<label>屏幕宽度 ${input('screenWidth','number','min="800" max="7680"')}</label><label>屏幕高度 ${input('screenHeight','number','min="600" max="4320"')}</label><label>像素倍率 ${input('deviceScaleFactor','number','min="0.75" max="3" step="0.25"')}</label>`)+
 row('canvasMode','Canvas 读取',select('canvasMode',[['protected','隐私保护'],['native','真实渲染结果']]))+
 row('webrtcMode','WebRTC',select('webrtcMode',[['blocked','禁用'],['proxy','报告代理出口'],['native','原生模式']]))+
 `<p class="help">已配置代理的环境，在下次启动时仍会自动匹配出口语言和时区。原生指纹设置主要对 Camoufox 生效。修改系统类型可能重新生成设备参数，网站可能要求验证登录。</p></div><div class="dialog-footer"><span id="batch-edit-count" class="muted"></span><button type="submit" class="btn primary" id="batch-edit-save">保存所选字段</button></div></form>`;
 document.body.append(dialog);const form=$('#batch-edit-form'),field=name=>form.elements.namedItem("batch_"+name);
 function sync(){const boxes=$$('[data-edit-field]',dialog);for(const box of boxes)$(`[data-field-content="${box.dataset.editField}"]`,dialog).disabled=!box.checked;const count=boxes.filter(b=>b.checked).length;$('#batch-edit-count').textContent=`${ids.length} 个环境 · ${count} 项修改`;$('#batch-edit-save').disabled=count===0;}
 $('#batch-edit').addEventListener('click',()=>{
  ids=[...state.selected];const profiles=state.profiles.filter(p=>ids.includes(p.id));if(!profiles.length)return;
  if(profiles.some(p=>p.running||p.busy)){toast('请先停止所有选中的环境，再批量编辑。',true);return;}
  form.reset();const first=profiles[0],f=first.fingerprint,n=f.native;
  const defaults={group:first.group,tags:'',notes:first.notes,locale:f.locale,timezoneId:f.timezoneId,width:f.viewport.width,height:f.viewport.height,colorScheme:f.colorScheme,userAgent:f.userAgent,cpuCores:n.cpuCores,screenWidth:n.screenWidth,screenHeight:n.screenHeight,deviceScaleFactor:n.deviceScaleFactor,canvasMode:n.canvasMode,webrtcMode:n.webrtcMode};
  for(const [key,value]of Object.entries(defaults))field(key).value=value;
  field('templateId').innerHTML=state.profiles.filter(p=>p.engine==='camoufox').map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  const templateBox=$('[data-edit-field=template]',dialog);templateBox.disabled=!field('templateId').options.length;
  $('#batch-edit-summary').textContent=`已选 ${profiles.length} 个环境：${profiles.slice(0,3).map(p=>p.name).join('、')}${profiles.length>3?'…':''}`;sync();dialog.showModal();
 });
 $('#batch-edit-close').onclick=()=>dialog.close();
 for(const box of $$('[data-edit-field]',dialog))box.addEventListener('change',sync);
 form.addEventListener('submit',e=>{
  e.preventDefault();const chosen=new Set($$('[data-edit-field]:checked',dialog).map(b=>b.dataset.editField)),changes={},fingerprint={},native={};const value=name=>field(name).value;
  for(const key of ['group','notes'])if(chosen.has(key))changes[key]=value(key);
  if(chosen.has('tags')){changes.tags=value('tags').split(/[,，]/).map(t=>t.trim()).filter(Boolean);changes.tagsMode=value('tagsMode');}
  if(chosen.has('startUrls'))changes.startUrls=value('startUrls').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  for(const key of ['locale','timezoneId','colorScheme','userAgent'])if(chosen.has(key))fingerprint[key]=value(key).trim();
  if(chosen.has('viewport'))fingerprint.viewport={width:Number(value('width')),height:Number(value('height'))};
  if(chosen.has('template'))changes.fingerprintTemplateId=value('templateId');
  if(chosen.has('screen'))for(const key of ['screenWidth','screenHeight','deviceScaleFactor'])native[key]=Number(value(key));
  if(chosen.has('cpuCores'))native.cpuCores=Number(value('cpuCores'));
  for(const key of ['canvasMode','webrtcMode'])if(chosen.has(key))native[key]=value(key);
  if(Object.keys(native).length)fingerprint.native=native;if(Object.keys(fingerprint).length)changes.fingerprint=fingerprint;
  perform(async()=>{const r=await api.batchEditProfiles({ids,changes});dialog.close();toast(`已更新 ${r.updated} 个环境，未勾选字段保持原样`);});
 });
})();
