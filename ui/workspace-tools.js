'use strict';
(()=>{
 const selected=new Set();let backupMode='create',assignIds=[];
 const pool=()=>state.proxyPool||[];
 const ids=()=>[...selected].filter(id=>pool().some(p=>p.id===id));
 const sameProxy=(a,b)=>a?.server&&b?.server&&new URL(a.server).href===new URL(b.server).href&&(a?.username||'')===(b?.username||'')&&(a?.password||'')===(b?.password||'');
 function render(){
  for(const id of selected)if(!pool().some(p=>p.id===id))selected.delete(id);
  $('#pool-count').textContent=`${pool().length} 条代理 · 已选 ${selected.size}`;
  $('#pool-select-all').checked=pool().length>0&&selected.size===pool().length;
  $('#pool-select-all').indeterminate=selected.size>0&&selected.size<pool().length;
  $('#proxy-list').innerHTML=pool().length?pool().map(p=>{
   const linked=state.profiles.filter(profile=>sameProxy(profile.proxy,p));const check=p.check;
   const result=!check?'尚未检测':check.ok?`${check.region.ip} · ${check.region.country} ${check.region.city||''}`:'检测失败';
   return `<div class="pool-row"><input type="checkbox" data-pool-id="${escapeHtml(p.id)}" ${selected.has(p.id)?'checked':''} aria-label="选择 ${escapeHtml(p.server)}"><div class="pool-address"><strong>${escapeHtml(p.server)}</strong><span class="subline">${escapeHtml(p.username?'用户名：'+p.username:'无需认证')}</span></div><div class="pool-check ${check&&!check.ok?'danger-text':''}">${escapeHtml(result)}${check?`<span class="subline">${escapeHtml(new Date(check.checkedAt).toLocaleString())}${check.ok?' · 查询耗时 '+check.latencyMs+' ms':''}</span>`:''}</div><div class="proxy-profiles">${linked.map(profile=>`<button data-proxy-profile="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</button>`).join('')||'<span class="muted">未分配</span>'}</div></div>`;
  }).join(''):'<div class="empty"><div class="empty-orbit">⇄</div><h2>把代理放进池中，按需分配</h2><p>点击「批量导入代理」，每行输入一条连接。<br>原有环境的代理会在升级时自动收录。</p></div>';
  for(const name of ['check','assign','delete'])$('#pool-'+name).disabled=state.busy||!!state.workspaceBusy||!selected.size;
  const busy=state.workspaceBusy,progress=state.operationProgress;
  $('#workspace-operation').classList.toggle('hidden',!busy);
  $('#workspace-operation').textContent=busy?`正在${busy}${progress?` · ${progress.done} / ${progress.total}`:'，请稍候…'}`:'';
 }
 function needSelection(){if(!ids().length){toast('请先勾选代理。',true);return false;}return true;}
 $('#pool-select-all').addEventListener('change',e=>{selected.clear();if(e.target.checked)pool().forEach(p=>selected.add(p.id));render();});
 $('#proxy-list').addEventListener('change',e=>{const id=e.target.dataset.poolId;if(!id)return;e.target.checked?selected.add(id):selected.delete(id);render();});
 $('#pool-import').addEventListener('click',()=>{$('#pool-import-text').value='';$('#pool-import-dialog').showModal();$('#pool-import-text').focus();});
 $('#pool-import-form').addEventListener('submit',e=>{e.preventDefault();perform(async()=>{const r=await api.importProxyPool($('#pool-import-text').value);$('#pool-import-text').value='';closeDialog('pool-import-dialog');toast(`导入 ${r.added} 条代理，跳过 ${r.duplicates} 条重复记录`);});});
 $('#pool-check').addEventListener('click',()=>{if(needSelection())perform(()=>api.checkProxyPool(ids()),r=>`已检测 ${r.checked} 条，${r.passed} 条可查询出口`);});
 $('#pool-delete').addEventListener('click',async()=>{if(!needSelection())return;const picked=ids();if(await confirmation(`删除 ${picked.length} 条池中代理？`,'环境已保存的代理连接继续保留；这里只移除代理池条目。'))perform(()=>api.deleteProxyPool(picked),'已移除池中代理');});
 $('#pool-assign').addEventListener('click',()=>{
  if(!needSelection())return;assignIds=ids();$('#pool-assign-summary').textContent=`使用 ${assignIds.length} 条代理，按代理列表顺序分配。`;
  $('#assign-all').checked=false;
  const profiles=state.profiles.filter(p=>!p.running&&!p.busy);
  $('#pool-assign-profiles').innerHTML=profiles.length?profiles.map(p=>`<label><input type="checkbox" name="assignProfile" value="${escapeHtml(p.id)}" ${state.selected.has(p.id)?'checked':''}><span>${escapeHtml(p.name)}<small>${escapeHtml(p.proxy?.server||'当前直连')}</small></span></label>`).join(''):'<p class="help">暂无已停止环境，请先创建或停止环境。</p>';
  $('#pool-assign-dialog').showModal();
 });
 $('#assign-all').addEventListener('change',e=>$$('[name=assignProfile]').forEach(el=>el.checked=e.target.checked));
 $('#pool-assign-form').addEventListener('submit',e=>{e.preventDefault();const profileIds=$$('[name=assignProfile]:checked').map(el=>el.value);if(!profileIds.length){toast('请勾选需要分配的环境。',true);return;}perform(async()=>{const r=await api.assignProxyPool({proxyIds:assignIds,profileIds,mode:$('#pool-assign-mode').value});closeDialog('pool-assign-dialog');toast(`已为 ${r.assigned} 个环境分配代理，下次启动生效`);});});
 const picker=document.createElement('label');picker.className='field full';picker.innerHTML='从代理池填入<select id="profile-pool-picker"><option value="">手动填写 / 保留当前代理</option></select>';
 $('[name=proxyServer]').closest('.field').before(picker);
 function fillProxyPicker(){
  $('#profile-pool-picker').innerHTML='<option value="">手动填写 / 保留当前代理</option>'+pool().map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.server)}${p.username?' · '+escapeHtml(p.username):''}</option>`).join('');
 }
 $('#profile-pool-picker').addEventListener('change',e=>{const proxy=pool().find(p=>p.id===e.target.value);if(!proxy)return;const f=$('#profile-form');f.elements.proxyServer.value=proxy.server;f.elements.proxyUsername.value=proxy.username;f.elements.proxyPassword.value=proxy.password;$('#proxy-match-result').textContent='已填入池中代理；启动时自动匹配地区。';});
 function openBackup(mode){
  if(state.profiles.some(p=>p.running||p.busy)){toast('请先点击「停止全部环境」，再备份或恢复。',true);return;}
  backupMode=mode;const create=mode==='create';$('#backup-form').reset();$('#backup-working').textContent='';
  $('#backup-title').textContent=create?'创建完整备份':'恢复完整备份';
  $('#backup-description').textContent=create?'备份全部环境及代理池。请设置单独的备份密码；丢失密码将无法恢复。':'输入备份文件的密码，再选择文件。恢复会新增环境，保留现有环境及本机设置。';
  $('#backup-confirm-label').classList.toggle('hidden',!create);$('#backup-password-confirm').required=create;
  $('#backup-submit').textContent=create?'选择保存位置并备份':'选择备份文件并恢复';$('#backup-dialog').showModal();$('#backup-password').focus();
 }
 $('#backup-create').addEventListener('click',()=>openBackup('create'));
 $('#backup-restore').addEventListener('click',()=>openBackup('restore'));
 $('#backup-stop-all').addEventListener('click',async()=>{const running=state.profiles.filter(p=>p.running).map(p=>p.id);if(!running.length){toast('全部环境已停止。');return;}if(await confirmation('停止全部环境？','浏览器窗口将关闭，已保存的浏览数据保留。','停止全部'))await lifecycle('stop',running);});
 $('#backup-dialog').addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});
 $('#backup-dialog').addEventListener('close',()=>{$('#backup-form').reset();});
 $('#backup-form').addEventListener('submit',async e=>{
  e.preventDefault();const password=$('#backup-password').value;
  if(backupMode==='create'&&password!==$('#backup-password-confirm').value){toast('两次输入的密码不一致。',true);return;}
  await perform(async()=>{
   $('#backup-working').textContent=backupMode==='create'?'选择位置后将加密打包，请保持程序打开。':'选择文件后将校验并恢复，请保持程序打开。';
   try{const r=await (backupMode==='create'?api.exportWorkspace(password):api.restoreWorkspace(password));if(r.canceled){$('#backup-working').textContent='已取消，可重新选择文件。';return;}
    const message=backupMode==='create'?`已备份 ${r.count} 个环境 · ${(r.bytes/1024/1024).toFixed(1)} MB\n${r.path}`:`已新增恢复 ${r.count} 个环境、${r.proxyCount} 条代理。`;
    $('#backup-result').textContent=message;closeDialog('backup-dialog');toast(backupMode==='create'?'完整备份已保存':message);
   }finally{$('#backup-password').value='';$('#backup-password-confirm').value='';$('#backup-working').textContent='';}
  });
 });
 window.workspaceTools={render,fillProxyPicker};render();
})();
