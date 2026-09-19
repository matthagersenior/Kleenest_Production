import fs from 'node:fs';

const threshold=String(process.argv[2]||process.env.AUDIT_LEVEL||'moderate').toLowerCase();
const severityRank={info:0,low:1,moderate:2,high:3,critical:4};
if(!(threshold in severityRank))throw new Error(`Unsupported audit threshold: ${threshold}`);

const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
if(Number(lock.lockfileVersion)<2||!lock.packages||typeof lock.packages!=='object'){
  throw new Error('A modern package-lock.json with a packages graph is required.');
}

const payload={};
for(const [path,meta] of Object.entries(lock.packages)){
  if(!path.includes('node_modules/')||!meta||typeof meta!=='object')continue;
  const version=String(meta.version||'').trim();
  if(!version||version.startsWith('file:')||version.startsWith('link:')||version.startsWith('workspace:'))continue;
  const marker=path.lastIndexOf('node_modules/');
  const fallback=path.slice(marker+'node_modules/'.length);
  const name=String(meta.name||fallback).trim();
  if(!name||name.includes('/node_modules/'))continue;
  (payload[name]??=[]).push(version);
}
for(const name of Object.keys(payload))payload[name]=[...new Set(payload[name])].sort();
if(!Object.keys(payload).length)throw new Error('Dependency graph is empty; refusing to pass the security gate.');

const endpoint='https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
let result=null;
let lastError='';
for(let attempt=1;attempt<=5;attempt+=1){
  try{
    const response=await fetch(endpoint,{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify(payload),
    });
    if(response.ok){
      result=await response.json();
      break;
    }
    lastError=`HTTP ${response.status} ${await response.text()}`;
    if(response.status<500&&response.status!==429)break;
  }catch(error){
    lastError=String(error);
  }
  if(attempt<5){
    const delayMs=attempt*5000;
    console.warn(`npm advisory service unavailable (${lastError}); retrying in ${delayMs/1000}s (${attempt}/5).`);
    await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
}
const findings=[];
if(result===null){
  console.warn(`npm bulk advisory endpoint unavailable after retries (${lastError}); falling back to OSV.`);
  const pairs=[];
  for(const [name,versions] of Object.entries(payload)){
    for(const version of versions)pairs.push({name,version});
  }
  const osvFindings=[];
  for(let offset=0;offset<pairs.length;offset+=200){
    const chunk=pairs.slice(offset,offset+200);
    const osvResponse=await fetch('https://api.osv.dev/v1/querybatch',{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({queries:chunk.map(item=>({package:{ecosystem:'npm',name:item.name},version:item.version}))}),
    });
    if(!osvResponse.ok)throw new Error(`Both npm and OSV advisory services are unavailable; OSV HTTP ${osvResponse.status}`);
    const osvPayload=await osvResponse.json();
    const results=Array.isArray(osvPayload?.results)?osvPayload.results:[];
    for(let i=0;i<chunk.length;i+=1){
      const item=chunk[i],vulns=Array.isArray(results[i]?.vulns)?results[i].vulns:[];
      for(const vuln of vulns){
        const rawSeverity=String(vuln?.database_specific?.severity||'').toLowerCase();
        let severity=['low','moderate','high','critical'].includes(rawSeverity)?rawSeverity:'moderate';
        if(!rawSeverity&&Array.isArray(vuln?.severity)){
          const scores=vuln.severity.map(entry=>String(entry?.score||''));
          const numeric=scores.map(score=>Number(score.match(/(?:CVSS:[^/]+\/)?([0-9]+(?:\.[0-9]+)?)/)?.[1])).filter(Number.isFinite);
          const max=numeric.length?Math.max(...numeric):NaN;
          if(Number.isFinite(max))severity=max>=9?'critical':max>=7?'high':max>=4?'moderate':'low';
        }
        osvFindings.push({
          name:item.name,
          version:item.version,
          severity,
          title:String(vuln?.summary||vuln?.id||'Published OSV security advisory'),
          url:String((Array.isArray(vuln?.references)?vuln.references:[]).find(ref=>ref?.url)?.url||`https://osv.dev/vulnerability/${vuln?.id||''}`),
        });
      }
    }
  }
  const seen=new Set();
  for(const finding of osvFindings){
    const key=`${finding.name}|${finding.version}|${finding.title}`;
    if(seen.has(key))continue;seen.add(key);
    if((severityRank[finding.severity]??2)>=severityRank[threshold])findings.push(finding);
  }
  if(!findings.length)console.log(`OSV fallback passed: ${pairs.length} locked package versions checked, no advisories at ${threshold} or higher.`);
}else{
for(const [name,advisories] of Object.entries(result||{})){
  for(const advisory of Array.isArray(advisories)?advisories:[]){
    const severity=String(advisory?.severity||'info').toLowerCase();
    if((severityRank[severity]??0)<severityRank[threshold])continue;
    findings.push({
      name,
      severity,
      title:String(advisory?.title||'Published npm security advisory'),
      url:String(advisory?.url||''),
      vulnerable_versions:String(advisory?.vulnerable_versions||''),
    });
  }
}
}
findings.sort((a,b)=>(severityRank[b.severity]-severityRank[a.severity])||a.name.localeCompare(b.name));
if(findings.length){
  console.error(`npm security advisory gate failed at ${threshold} or higher (${findings.length} finding(s)):`);
  for(const finding of findings){
    console.error(`- [${finding.severity}] ${finding.name}: ${finding.title}${finding.url?` — ${finding.url}`:''}`);
  }
  process.exit(1);
}
if(result!==null)console.log(`npm bulk advisory gate passed: ${Object.keys(payload).length} packages checked, no advisories at ${threshold} or higher.`);
