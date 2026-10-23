'use strict';
function configureNewTabs(context,url){
 const targets=new Set(['chrome://newtab/','chrome://new-tab-page/','edge://newtab/']);
 const watch=page=>{
  let redirecting=false;
  const redirect=()=>{if(redirecting||page.isClosed()||!targets.has(page.url()))return;redirecting=true;page.goto(url,{waitUntil:'domcontentloaded',timeout:20000}).catch(()=>{}).finally(()=>{redirecting=false;});};
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())redirect();});redirect();
 };
 context.on('page',watch);context.pages().forEach(watch);
}
module.exports={configureNewTabs};
