import fs from 'node:fs';

const args=process.argv.slice(2);
const value=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]||'':''};
const optional=args.includes('--optional');
const target=value('--target-sha')||process.env.TARGET_SHA||'';
const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN||'';
const repo=process.env.GITHUB_REPOSITORY||'matthagersenior/Kleenest_Production';
const output=process.env.GITHUB_OUTPUT;
const requiredArtifacts=[
  'Kleenest-Consumer-Standalone-APK',
  'Kleenest-Business-Standalone-APK',
  'Kleenest-Fleet-Standalone-APK',
  'Kleenest-Owner-Standalone-APK',
];

if(!token){console.error('GH_TOKEN is required to resolve the app-family APK baseline.');process.exit(optional?0:2)}
const headers={Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'};
async function api(path){const r=await fetch(`https://api.github.com/repos/${repo}/${path}`,{headers});if(!r.ok)throw new Error(`GitHub API ${r.status}: ${await r.text()}`);return r.json()}
function emit(data){
  const artifacts=data?.artifacts||[];
  const rows={
    source_sha:data?.run?.head_sha||'',
    run_id:String(data?.run?.id||''),
    same_sha:String(Boolean(target&&data?.run?.head_sha===target)),
    artifact_ids:artifacts.map(a=>a.id).join(','),
  };
  for(const[k,v]of Object.entries(rows)){console.log(`${k}=${v}`);if(output)fs.appendFileSync(output,`${k}=${v}\n`)}
}
async function familyArtifacts(run){
  if(run.conclusion!=='success')return null;
  const payload=await api(`actions/runs/${run.id}/artifacts?per_page=100`);
  const active=(payload.artifacts||[]).filter(a=>!a.expired);
  const artifacts=requiredArtifacts.map(name=>active.find(a=>a.name===name)).filter(Boolean);
  return artifacts.length===requiredArtifacts.length?{run,artifacts}:null;
}
try{
  const payload=await api('actions/workflows/android-family.yml/runs?branch=main&status=success&per_page=50');
  const runs=(payload.workflow_runs||[]).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  let found=null;
  if(target){
    for(const run of runs.filter(r=>r.head_sha===target)){found=await familyArtifacts(run);if(found)break}
  }
  if(!found){
    for(const run of runs){found=await familyArtifacts(run);if(found)break}
  }
  if(!found){console.error('No successful non-expired complete four-APK family artifact set was found.');process.exit(optional?0:3)}
  emit(found);
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exit(optional?0:4)}
