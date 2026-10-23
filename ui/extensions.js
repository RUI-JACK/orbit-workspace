'use strict';
(()=>{
 const selected=new Set();let targetProfile='',pendingIds=[],mode='add';
 const library=()=>state.extensions?.library||[],nativeProfiles=()=>state.profiles.filter(p=>p.engine==='camoufox');
 const labels={enabled:'已启用',disabled:'已禁用',error:'加载受阻',pending:'待启动确认',inactive:'未激活',changed:'版本变更'};
 function render(){
  for(const id of selected)if(!library().some(e=>e.id===id))selected.delete(id);
  $('#extension-count').textContent=`${library().length} 个扩展 · 已选 ${selected.size}`;
  $('#extension-all').checked=library().length>0&&selected.size===library().length;$('#extension-all').indeterminate=selected.size>0&&selected.size<library().length;
  $('#extension-library').innerHTML=library().length?library().map(e=>{
   const assigned=state.profiles.filter(p=>(p.extensionIds||[]).includes(e.id));
   return `<article class="extension-row"><input type="checkbox" data-extension="${escapeHtml(e.id)}" ${selected.has(e.id)?'checked':''} aria-label="选择 ${escapeHtml(e.name)}"><span class="extension-icon">◇</span><div class="extension-main"><strong>${escapeHtml(e.name)}</strong><span class="subline extension-id">${escapeHtml(e.addonId)}</span><details><summary>权限与文件信息</summary><p>${escapeHtml(e.description||'未提供说明')}</p><p>权限：${escapeHtml(e.permissions.join('、')||'无额外权限')}</p><p>SHA-256：${escapeHtml(e.sha256)}</p></details></div><div><strong class="extension-version">v${escapeHtml(e.version)}</strong><span class="subline">${(e.size/1024/1024).toFixed(1)} MB · MV${e.manifestVersion}</span></div><div class="extension-assigned">${assigned.length} 个环境<span class="subline">${assigned.length?'已分配':'尚未分配'}</span></div></article>`;
  }).join(''):'<div class="empty extension-empty"><div class="empty-orbit">◇</div><h2>把常用扩展集中放在这里</h2><p>导入 Firefox 的 .xpi 文件，或从下方已有环境收录。<br>勾选扩展后，可以一次安装到多个狐狸环境。</p></div>';
  const locked=state.busy||!!state.workspaceBusy;
  for(const id of ['extension-install','extension-remove','extension-delete'])$( '#'+id).disabled=locked||!selected.size;
  $('#extension-import').disabled=locked;
  const profiles=nativeProfiles();if(!profiles.some(p=>p.id===targetProfile))targetProfile=profiles[0]?.id||'';
  $('#extension-environment').innerHTML=profiles.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.running?' · 运行中':''}</option>`).join('')||'<option value="">暂无狐狸环境</option>';$('#extension-environment').value=targetProfile;
  const record=state.extensions?.environments?.find(e=>e.profileId===targetProfile),p=profiles.find(p=>p.id===targetProfile);
  $('#extension-status-note').textContent=record?.error|| (record?.checkedAt?`浏览器记录：${new Date(record.checkedAt).toLocaleString('zh-CN')}。启用状态不代表扩展后台功能已经通过检测。`:'启动环境后显示浏览器的加载记录。');
  $('#extension-environment-list').innerHTML=record?.addons.length?record.addons.map(a=>`<div class="extension-state-row"><div><strong>${escapeHtml(a.name)}</strong><span class="subline">v${escapeHtml(a.version)} · ${a.assigned?'已分配':a.managed||a.pendingRemoval?'待移除确认':'浏览器自行安装'}</span></div><div><span class="status ${a.status==='enabled'?'running':a.status==='error'?'extension-error':''}">${labels[a.status]||'未知'}</span><span class="subline">${escapeHtml(a.detail)}</span></div><button class="btn small" data-collect="${escapeHtml(a.addonId)}" ${locked||a.status==='pending'?'disabled':''}>收录到库</button></div>`).join(''):`<div class="extension-no-addons">${p?'此环境暂无扩展记录。分配后启动一次，即可查看状态。':'创建一个 Camoufox 环境后，即可批量管理扩展。'}</div>`;
 }
 function assign(operation){
  if(!selected.size)return;mode=operation;pendingIds=[...selected];
  $('#extension-assign-title').textContent=mode==='add'?'批量安装扩展':'批量移除扩展';
  $('#extension-assign-summary').textContent=`${pendingIds.map(id=>library().find(e=>e.id===id)?.name).join('、')} · ${pendingIds.length} 个扩展`;
  $('#extension-assign-help').textContent=mode==='add'?'安装到所选环境。相同 ID 的库中扩展可更新版本；已有手动安装的不同版本会提示冲突。浏览器会在下次启动校验并加载。':'移除所选环境中由扩展库管理的安装文件。扩展自己的本地数据保留；运行中的环境请先停止。';
  $('#extension-profiles').innerHTML=nativeProfiles().map(p=>`<label><input type="checkbox" name="extensionProfile" value="${escapeHtml(p.id)}" ${p.running||p.busy?'disabled':state.selected.has(p.id)?'checked':''}><span>${escapeHtml(p.name)}<small>${p.running?'运行中 · 请先停止':p.busy?'正在启动或停止':`${pendingIds.filter(id=>(p.extensionIds||[]).includes(id)).length} / ${pendingIds.length} 个已分配`}</small></span></label>`).join('')||'<p class="help">暂无狐狸环境，请先创建。</p>';
  $('#extension-profile-all').checked=false;$('#extension-assign-submit').textContent=mode==='add'?'安装到所选环境':'从所选环境移除';$('#extension-assign-dialog').showModal();
 }
 $('#extension-all').addEventListener('change',e=>{selected.clear();if(e.target.checked)library().forEach(e=>selected.add(e.id));render();});
 $('#extension-library').addEventListener('change',e=>{const id=e.target.dataset.extension;if(!id)return;e.target.checked?selected.add(id):selected.delete(id);render();});
 $('#extension-environment').addEventListener('change',e=>{targetProfile=e.target.value;render();});
 $('#extension-refresh').addEventListener('click',()=>perform(async()=>{state.extensions=await api.extensionSnapshot();render();},'已刷新浏览器扩展记录'));
 $('#extension-import').addEventListener('click',()=>perform(async()=>{const r=await api.chooseExtensions();if(r.canceled)return;for(const item of r.results)if(item.ok)selected.add(item.extension.id);const failed=r.results.filter(x=>!x.ok);$('#extension-import-result').textContent=failed.map(x=>x.name+'：'+x.error).join('\n');toast(`已收录 ${r.results.length-failed.length} 个扩展${failed.length?`，${failed.length} 个失败`:''}`,!!failed.length);}));
 $('#extension-environment-list').addEventListener('click',e=>{const button=e.target.closest('[data-collect]');if(button)perform(async()=>{const r=await api.collectExtension({profileId:targetProfile,addonId:button.dataset.collect});selected.add(r.extension.id);toast(r.duplicate?'此版本已在扩展库中':'已收录 '+r.extension.name);});});
 $('#extension-install').addEventListener('click',()=>assign('add'));$('#extension-remove').addEventListener('click',()=>assign('remove'));
 $('#extension-profile-all').addEventListener('change',e=>$$('[name=extensionProfile]:not(:disabled)').forEach(el=>el.checked=e.target.checked));
 $('#extension-assign-form').addEventListener('submit',e=>{e.preventDefault();const profileIds=$$('[name=extensionProfile]:checked:not(:disabled)').map(el=>el.value);if(!profileIds.length){toast('请先选择已停止的狐狸环境。',true);return;}perform(async()=>{const r=await api.assignExtensions({profileIds,extensionIds:pendingIds,mode});closeDialog('extension-assign-dialog');toast(`已${mode==='add'?'部署':'移除'} ${r.updated} 个环境的扩展，下次启动确认`);});});
 $('#extension-delete').addEventListener('click',async()=>{if(!selected.size)return;const ids=[...selected];if(await confirmation(`删除库中 ${ids.length} 个扩展？`,'请先从所有环境移除分配。未分配的库记录可删除，浏览器自行安装的扩展保留。'))perform(()=>api.deleteExtensions(ids),'已删除库中记录');});
 window.extensionManager={render};render();
})();
