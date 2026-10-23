'use strict';
(()=>{
 let dirty=false;
 const labels={idle:'等待检查',unconfigured:'尚未配置发布地址',checking:'正在检查',current:'已是当前稳定版本',available:'发现新版本',downloading:'正在下载',validating:'正在校验与自检',ready:'下载完成，等待安装',blocked:'需要先更新程序',error:'更新未完成',installing:'正在安装'};
 function render(){const u=state.updates;if(!u)return;const locked=!!u.active||!!state.workspaceBusy;$('#update-check').disabled=locked;$('#update-save').disabled=locked;
  if(!dirty){$('#update-auto-check').checked=u.settings.autoCheck;$('#update-auto-download').checked=u.settings.autoDownload;$('#update-feed').value=u.settings.appFeed||'';}
  for(const kind of ['app','engine']){const s=u[kind],root=$('#update-'+kind);root.querySelector('.update-version').textContent=s.currentVersion;root.querySelector('.update-label').textContent=labels[s.status]||s.status;root.querySelector('.update-label').className='update-label '+s.status;const target=s.version?'可用版本：'+s.version:'';root.querySelector('.update-meta').textContent=[target,s.checkedAt?'检查于 '+new Date(s.checkedAt).toLocaleString('zh-CN'):'尚未检查'].filter(Boolean).join(' · ');root.querySelector('.update-message').textContent=s.error||s.blockedReason||(s.status==='ready'?(kind==='app'?'下次启动程序时安装，也可在环境全部停止后立即重启安装。':'所有环境停止后自动启用；也可以手动启用。'):s.status==='unconfigured'?'填写新版发布清单地址后，才能接收程序更新。':s.status==='current'&&kind==='engine'?'官方稳定频道；测试版不会自动安装。':s.notes||'');
   const progress=root.querySelector('progress');progress.classList.toggle('hidden',!s.progress);if(s.progress){progress.max=s.progress.total;progress.value=s.progress.received;root.querySelector('.update-progress').textContent=`${(s.progress.received/1024/1024).toFixed(1)} / ${(s.progress.total/1024/1024).toFixed(1)} MB`;}else root.querySelector('.update-progress').textContent='';
   const canDownload=!!s.version&&['available','error'].includes(s.status)&&!s.blockedReason,ready=s.status==='ready',running=state.profiles.some(p=>p.running||p.busy);root.querySelector('[data-update=download]').classList.toggle('hidden',!canDownload);root.querySelector('[data-update=download]').disabled=locked;root.querySelector('[data-update=cancel]').classList.toggle('hidden',s.status!=='downloading');root.querySelector('[data-update=install]').classList.toggle('hidden',!ready);root.querySelector('[data-update=install]').disabled=locked||running;
  }
  $('#update-engine-rollback').classList.toggle('hidden',!u.engine.canRollback);$('#update-engine-rollback').disabled=locked||state.profiles.some(p=>p.running||p.busy);
 }
 async function action(work,message){try{await work();dirty=false;if(message)toast(message);}catch(e){toast(e.message||'更新操作未成功',true);}finally{await refresh();}}
 $('#update-settings-form').addEventListener('input',()=>{dirty=true;});
 $('#update-settings-form').addEventListener('submit',e=>{e.preventDefault();action(()=>api.saveUpdateSettings({autoCheck:$('#update-auto-check').checked,autoDownload:$('#update-auto-download').checked,appFeed:$('#update-feed').value}),'更新设置已保存');});
 $('#update-check').addEventListener('click',()=>action(()=>api.checkUpdates()));
 $('#update-guide').addEventListener('click',()=>action(()=>api.openUpdateGuide()));
 for(const kind of ['app','engine'])$('#update-'+kind).addEventListener('click',e=>{const b=e.target.closest('[data-update]');if(!b||b.disabled)return;const type=b.dataset.update;if(type==='download')action(()=>api.downloadUpdate(kind));if(type==='cancel')action(()=>api.cancelUpdate(kind));if(type==='install')action(()=>kind==='app'?api.installAppUpdate():api.activateEngineUpdate());});
 $('#update-engine-rollback').addEventListener('click',()=>action(()=>api.rollbackEngineUpdate(),'已切回之前的内核'));
 window.updateTools={render};render();
})();
