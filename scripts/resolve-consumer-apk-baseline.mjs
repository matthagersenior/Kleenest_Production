const args=process.argv.slice(2);
const value=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]||'':''};
const optional=args.includes('--optional');
const target=value('--target-sha')||process.env.TARGET_SHA||'';
const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN||'';
const repo=process.env.GITHUB_REPOSITORY||'matthagersenior/Kleenest_Production';
const output=process.env.GITHUB_OUTPUT;
if(!token){console.error('GH_TOKEN is required to resolve Consumer APK baseline.');process.exit(optional?0:2)}
const headers={Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'};
async function api(path){const r=await fetch(`https://api.github.com/repos/${repo}/${path}`,{headers});if(!r.ok)throw new Error(`GitHub API ${r.status}: ${await r.text()}`);return r.json()}
async function artifactFor(run){
 const payload=await api(`actions/runs/${run.id}/artifacts?per_page=100`);
 const artifact=(payload.artifacts||[]).find(a=>a.name==='Kleenest-Consumer-Standalone-APK'&&!a.expired);
 return artifact?{run,artifact}:null;
}
function emit(data){
 const rows={source_sha:data?.run?.head_sha||'',run_id:String(data?.run?.id||''),artifact_id:String(data?.artifact?.id||''),same_sha:String(Boolean(target&&data?.run?.head_sha===target))};
 for(const [k,v] of Object.entries(rows)){console.log(`${k}=${v}`);if(output)fs.appendFileSync(output,`${k}=${v}\n`)}
}
import fs from 'node:fs';
try{
 const payload=await api('actions/workflows/android-family.yml/runs?branch=main&per_page=40');
 const runs=(payload.workflow_runs||[]).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 let found=null;
 if(target){
   for(const run of runs.filter(r=>r.head_sha===target)){found=await artifactFor(run);if(found)break}
 }
 if(!found){
   for(const run of runs){found=await artifactFor(run);if(found)break}
 }
 if(!found){console.error('No non-expired verified Consumer APK artifact was found.');process.exit(optional?0:3)}
 emit(found);
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exit(optional?0:4)}
