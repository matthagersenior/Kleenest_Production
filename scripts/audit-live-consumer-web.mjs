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
        const value=response.headers.get(header);
        record('Header '+header,value||'MISSING');
        if(!value&&header!=='content-security-policy')failed=true;
      }
      record('HTML cache-control',response.headers.get('cache-control')||'MISSING');
      record('Content encoding',response.headers.get('content-encoding')||'not indicated');
    }
  }catch(error){
    record('HTTP '+route,'ERROR: '+error.message);
    failed=true;
  }
}
// Check links actually rendered in the initial public HTML. Keep a precise
// source-to-destination ledger so third-party SEO reports can be reproduced.
const linkFailures=[];
const checked=new Map();
for(const route of ['/','/about/','/for-you/','/for-business/','/trust/','/install/','/contact/']){
  try{
    const response=await fetch(origin+route,{signal:AbortSignal.timeout(20000)});
    if(!response.ok){record('Public route '+route,'HTTP '+response.status);failed=true;continue;}
    const html=await response.text();
    if(route==='/'){
      const hasSeoMarker=html.includes('kleenest-public-seo:start');
      const hasPublicLinks=html.includes('id="kleenest-public-links"');
      record('Live SEO export marker',hasSeoMarker?'present':'MISSING');
      record('Live crawlable navigation',hasPublicLinks?'present':'MISSING');
      if(!hasSeoMarker||!hasPublicLinks)failed=true;
    }
    const hrefs=[...html.matchAll(/\\bhref\\s*=\\s*["']([^"']+)["']/gi)].map(match=>match[1]);
    for(const href of hrefs){
      let target;
      try{target=new URL(href,origin+route);}catch{continue;}
      if(target.origin!==origin||!['http:','https:'].includes(target.protocol))continue;
      if(target.pathname.startsWith('/_expo/')||target.pathname.startsWith('/assets/'))continue;
      target.hash='';
      const key=target.toString();
      if(!checked.has(key)){
        try{
          const res=await fetch(key,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(12000)});
          checked.set(key,res.status);
        }catch(error){checked.set(key,'ERROR '+error.message);}
      }
      const status=checked.get(key);
      if(status===404||status===410||typeof status==='number'&&status>=500)linkFailures.push({from:route,to:target.pathname,status});
    }
  }catch(error){record('Public link crawl '+route,'ERROR '+error.message);failed=true;}
}
record('Public internal links checked',checked.size);
if(checked.size===0){record('Link crawl integrity','FAIL: no links discovered');failed=true;}
record('Broken public internal links',linkFailures.length);
for(const item of linkFailures.slice(0,30))record('Broken link '+item.from+' → '+item.to,item.status);
if(linkFailures.length)failed=true;

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
