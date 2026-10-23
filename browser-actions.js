'use strict';
function httpUrl(value){if(typeof value!=='string'||value.length>4096)throw Error('请输入 HTTP/HTTPS 网址');let u;try{u=new URL(value);}catch{throw Error('请输入完整网址');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('网址仅支持无内嵌密码的 HTTP/HTTPS');return u.href;}
function selector(value){if(typeof value!=='string'||!value.trim()||value.length>2000)throw Error('请输入不超过 2000 字符的元素选择器');return value.trim();}
function step(raw){if(!raw||typeof raw!=='object')throw Error('步骤格式无效');const type=raw.type,out={type};
 if(type==='goto')out.url=httpUrl(raw.url);
 else if(type==='wait'){const n=Number(raw.ms);if(!Number.isInteger(n)||n<0||n>300000)throw Error('等待时间需为 0–300000 毫秒');out.ms=n;}
 else if(['click','fill','press','select','check','waitFor'].includes(type)){
  out.selector=selector(raw.selector);
  if(raw.frames!==undefined){if(!Array.isArray(raw.frames)||raw.frames.length>10)throw Error('iframe 路径无效');if(raw.frames.length)out.frames=raw.frames.map(selector);}
  if(['fill','select'].includes(type)){if(typeof raw.value!=='string'||raw.value.length>20000)throw Error('输入值最多 20000 字符');out.value=raw.value;}
  if(type==='press'){if(typeof raw.key!=='string'||!/^(?:(?:Control|Meta|Alt|Shift)\+)*(?:Enter|Tab|Escape|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Space|[a-zA-Z0-9])$/.test(raw.key))throw Error('按键格式无效，例如 Enter 或 Control+A');out.key=raw.key;}
  if(type==='check'){if(typeof raw.checked!=='boolean')throw Error('勾选状态无效');out.checked=raw.checked;}
 }else throw Error('不支持的步骤类型');
 const timeout=Number(raw.timeout??10000);if(!Number.isInteger(timeout)||timeout<500||timeout>30000)throw Error('步骤超时需为 500–30000 毫秒');out.timeout=timeout;
 if(type!=='wait'){const retries=Number(raw.retries??0),retryDelay=Number(raw.retryDelay??1000);if(!Number.isInteger(retries)||retries<0||retries>5)throw Error('重试次数需为 0–5');if(!Number.isInteger(retryDelay)||retryDelay<100||retryDelay>60000)throw Error('重试间隔需为 100–60000 毫秒');out.retries=retries;out.retryDelay=retryDelay;}return out;
}
async function execute(page,s){const opt={timeout:s.timeout||10000};if(s.type==='goto'){const response=await page.goto(s.url,{waitUntil:'domcontentloaded',...opt});if(response&&response.status()>=400)throw Object.assign(Error('网页返回 HTTP 错误'),{code:'PAGE_HTTP',httpStatus:response.status()});return response;}let frame=page;for(const selector of s.frames||[])frame=frame.frameLocator(selector);const loc=frame.locator(s.selector);if(s.type==='click')await loc.click(opt);else if(s.type==='fill')await loc.fill(s.value,opt);else if(s.type==='press')await loc.press(s.key,opt);else if(s.type==='select')await loc.selectOption(s.value,opt);else if(s.type==='check')await loc.setChecked(s.checked,opt);else if(s.type==='waitFor')await loc.waitFor({state:'visible',...opt});else throw Error('不支持的网页操作');}
module.exports={httpUrl,selector,step,execute};
