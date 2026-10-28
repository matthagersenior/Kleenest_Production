import fs from 'node:fs';

const origin='https://kleenest.us';
const lines=['# Kleenest production web audit',''];
const record=(name,value)=>lines.push('| '+name+' | '+String(value).replaceAll('|','/')+' |');
lines.push('| Check | Observed |','|---|---|');
let failed=false;
for(const route of ['/','/explore/','/qr/','/home/','/games/']){
  try{
    const response=await fetch(origin+route,{signal:AbortSignal.timeout(20000),redirect:'follow'});
    record('HTTP '+route,response.status+' '+response.url);
    if(!response.ok)failed=true;
    if(route==='/'){
      for(const header of ['strict-transport-security','content-security-policy','x-frame-options','x-content-type-options','referrer-policy','permissions-policy']){
        record('Header '+header,response.headers.get(header)||'MISSING');
      }
      record('HTML cache-control',response.headers.get('cache-control')||'MISSING');
      record('Content encoding',response.headers.get('content-encoding')||'not indicated');
    }
  }catch(error){
    record('HTTP '+route,'ERROR: '+error.message);
    failed=true;
  }
}
try{
  const url='https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&url='+encodeURIComponent(origin+'/');
  const response=await fetch(url,{signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw new Error('PageSpeed API HTTP '+response.status);
  const report=await response.json();
  const audits=report.lighthouseResult?.audits||{};
  record('PageSpeed mobile performance score',Math.round((report.lighthouseResult?.categories?.performance?.score||0)*100));
  for(const [label,key] of [['LCP','largest-contentful-paint'],['FCP','first-contentful-paint'],['TBT','total-blocking-time'],['CLS','cumulative-layout-shift']]){
    record('PageSpeed '+label,audits[key]?.displayValue||'unavailable');
  }
  record('LCP element',audits['largest-contentful-paint-element']?.details?.items?.[0]?.node?.snippet||'unavailable');
}catch(error){
  record('PageSpeed mobile','unavailable: '+error.message);
}
const output=lines.join('\n')+'\n';
console.log(output);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,output);
if(failed)process.exitCode=1;
