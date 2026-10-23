'use strict';
(()=>{
 let profileFilter='',outcomeFilter='all',selectedId='';
 const statuses={running:'正在启动',ready:'首页已就绪',failed:'启动失败',warning:'首页异常',cancelled:'已中断',interrupted:'上次未完成'};
 const phaseStatuses={pending:'未执行',running:'进行中',ok:'完成',skipped:'跳过',error:'失败',interrupted:'未完成'};
 const duration=ms=>ms===null||ms===undefined?'—':ms<1000?`${ms} ms`:`${(ms/1000).toFixed(2)} 秒`;
 const data=()=>state.startupDiagnostics||{records:[]};
 const name=r=>state.profiles.find(p=>p.id===r.profileId)?.name||'已删除的环境';
 const runningMs=stage=>stage.status==='running'?Math.max(0,Date.now()-Date.parse(stage.startedAt)):stage.durationMs;
 function render(tick=false){
  if(!$('#page-diagnostics'))return;
  if(profileFilter&&!state.profiles.some(p=>p.id===profileFilter))profileFilter='';
  if(!tick){const options='<option value="">全部环境</option>'+state.profiles.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');if($('#diagnostic-profile').innerHTML!==options)$('#diagnostic-profile').innerHTML=options;if($('#diagnostic-profile').value!==profileFilter)$('#diagnostic-profile').value=profileFilter;}
  const records=data().records.filter(r=>(!profileFilter||r.profileId===profileFilter)&&(outcomeFilter!=='problems'||['failed','warning','interrupted'].includes(r.status)));
  if(!records.some(r=>r.id===selectedId))selectedId=records[0]?.id||'';const selected=records.find(r=>r.id===selectedId);
  if(!tick){$('#diagnostic-count').textContent=`${records.length} 次记录`;
  $('#diagnostic-list').innerHTML=records.length?records.map(r=>`<button class="diagnostic-record ${r.id===selectedId?'selected':''}" data-run="${escapeHtml(r.id)}"><span class="diagnostic-record-top"><strong>${escapeHtml(name(r))}</strong><span class="diagnostic-result ${escapeHtml(r.status)}">${statuses[r.status]||'未知'}</span></span><span class="diagnostic-record-bottom">${escapeHtml(new Date(r.startedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}))}<span>${r.status==='running'?'计时中':duration(r.totalMs)}</span></span></button>`).join(''):'<div class="diagnostic-empty">暂无记录<br>启动一次环境后，即可查看各阶段耗时。</div>';
  $('#diagnostic-clear').disabled=state.busy||!!state.workspaceBusy||!data().records.some(r=>r.status!=='running'&&(!profileFilter||r.profileId===profileFilter));
  $('#diagnostic-warning').textContent=data().warning||'';}
  $('#diagnostic-detail').classList.toggle('hidden',!selected);$('#diagnostic-empty-detail').classList.toggle('hidden',!!selected);
  if(!selected)return;
  const stages=selected.stages,max=Math.max(1,...stages.map(s=>runningMs(s)||0)),finished=stages.filter(s=>['ok','error'].includes(s.status)),slowest=[...finished].sort((a,b)=>b.durationMs-a.durationMs)[0];
  $('#diagnostic-title').textContent=name(selected);$('#diagnostic-engine').textContent=`${selected.engine==='camoufox'?'Camoufox / Firefox':'Chrome / Edge'} · ${new Date(selected.startedAt).toLocaleString('zh-CN')}`;
  $('#diagnostic-result').textContent=statuses[selected.status]||'未知';$('#diagnostic-result').className='diagnostic-result '+selected.status;
  $('#diagnostic-window-time').textContent=duration(selected.browserReadyMs);$('#diagnostic-total-time').textContent=selected.status==='running'?'计时中':duration(selected.totalMs);$('#diagnostic-slowest').textContent=slowest?.label||'—';
  $('#diagnostic-phases').innerHTML=stages.map((s,i)=>`<div class="diagnostic-phase ${escapeHtml(s.status)}"><span class="diagnostic-step">${s.status==='ok'?'✓':s.status==='error'?'!':i+1}</span><div><div class="diagnostic-phase-title"><strong>${escapeHtml(s.label)}</strong><span>${duration(runningMs(s))}</span></div><progress max="${max}" value="${runningMs(s)||0}" aria-label="${escapeHtml(s.label)}耗时"></progress><span class="subline">${escapeHtml(s.error?.message||s.note||phaseStatuses[s.status]||'')}${s.key==='proxy'&&s.status==='ok'?' · 端口可达，认证与出口由下一步验证':''}${s.key==='prepare'&&s.status==='ok'?' · 扩展部署与指纹准备':''}</span></div></div>`).join('');
  $('#diagnostic-advice').classList.toggle('hidden',!selected.error);$('#diagnostic-advice-title').textContent=selected.error?.message||'';$('#diagnostic-advice-hint').textContent=selected.error?.hint||'';$('#diagnostic-error-code').textContent=selected.error?.code||'';
  $('#diagnostic-measurement-note').textContent='窗口打开耗时包含代理检查、地区查询、环境准备与浏览器启动；总耗时继续计入所有启动页面的 DOM 就绪，每页最多等待 20 秒，不含后续图片及后台请求。';
 }
 function open(profileId){profileFilter=profileId;outcomeFilter='all';$('#diagnostic-outcome').value='all';selectedId='';showPage('diagnostics');render();}
 $('#diagnostic-profile').addEventListener('change',e=>{profileFilter=e.target.value;selectedId='';render();});
 $('#diagnostic-outcome').addEventListener('change',e=>{outcomeFilter=e.target.value;selectedId='';render();});
 $('#diagnostic-list').addEventListener('click',e=>{const button=e.target.closest('[data-run]');if(button){selectedId=button.dataset.run;render();}});
 $('#diagnostic-clear').addEventListener('click',async()=>{if(await confirmation('清除启动诊断记录？',profileFilter?'清除所选环境已结束的诊断记录，环境与浏览数据保留。':'清除本机已结束的诊断记录，环境与浏览数据保留。','清除记录'))perform(()=>api.clearStartupDiagnostics(profileFilter||undefined),'已清除诊断记录');});
 window.startupDiagnostics={render,open};
 setInterval(()=>{if(state.page==='diagnostics'&&data().records.some(r=>r.status==='running'))render(true);},1000);
 render();
})();
