'use strict';
const {request}=require('playwright-core');
const {isIP}=require('node:net');
const ENDPOINT='https://ipwho.is/?fields=success,message,ip,country,country_code,city,timezone.id,latitude,longitude';
function regionSettings(data){
  if(!data||data.success!==true)throw Error('出口地区查询未成功，请检查代理或稍后重试');
  if(!isIP(data.ip)||!/^[A-Z]{2}$/.test(data.country_code||'')||!data.timezone?.id)throw Error('地区服务没有返回有效的 IP、国家或时区');
  const timezoneId=String(data.timezone.id);
  let locale;
  try{
    new Intl.DateTimeFormat('en-US',{timeZone:timezoneId});
    const likely=new Intl.Locale('und-'+data.country_code).maximize();
    locale=likely.language+'-'+data.country_code;
    new Intl.DateTimeFormat(locale);
  }catch{throw Error('地区服务返回了无效的语言或时区，请手动设置');}
  return {ip:data.ip,country:String(data.country||data.country_code).slice(0,100),countryCode:data.country_code,city:String(data.city||'').slice(0,100),timezoneId,locale,...(Number.isFinite(data.latitude)&&Number.isFinite(data.longitude)&&Math.abs(data.latitude)<=90&&Math.abs(data.longitude)<=180?{latitude:data.latitude,longitude:data.longitude}:{}),checkedAt:new Date().toISOString()};
}
async function lookupProxyRegion(proxy,{endpoint=ENDPOINT,timeout=15000}={}){
  if(!proxy?.server)throw Error('请先填写这个环境的代理地址；本功能不读取系统代理');
  // Always supply an explicit proxy; a failed proxy must never fall back to direct lookup.
  const ctx=await request.newContext({proxy:{server:proxy.server,username:proxy.username||undefined,password:proxy.password||undefined},timeout,ignoreHTTPSErrors:false});
  try{
    const response=await ctx.get(endpoint,{maxRedirects:0,maxRetries:0});
    if(!response.ok())throw Error('出口地区服务响应 HTTP '+response.status());
    if((await response.body()).length>65536)throw Error('出口地区服务返回过多数据');
    return regionSettings(await response.json());
  }catch(e){
    // Do not expose Playwright's call log, which can contain a proxy address or credentials.
    if(/^出口地区|^地区服务/.test(e.message)){e.code=/HTTP 407/.test(e.message)?'PROXY_AUTH':/HTTP/.test(e.message)?'REGION_HTTP':'REGION_INVALID';throw e;}
    const code=/407|proxy authentication|invalid.auth/i.test(e.message)?'PROXY_AUTH':/timeout|timed out/i.test(e.message)?'REGION_TIMEOUT':'REGION_ROUTE';
    throw Object.assign(Error('无法通过该代理查询出口地区，请检查代理连接、账号密码，或稍后重试。未改动原来的语言和时区。'),{code});
  }finally{await ctx.dispose();}
}
module.exports={lookupProxyRegion,regionSettings,ENDPOINT};
