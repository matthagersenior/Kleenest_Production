import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const migrationsDir=path.join(root,'supabase','migrations');
const managedFloor='20260917061009';
const supabaseUrl=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const audience=process.env.SUPABASE_READINESS_AUDIENCE||'kleenest-supabase-production-readiness';
const releaseSha=process.env.RELEASE_SHA||'';
const oidcRequestUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'';
const oidcRequestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'';

if(!supabaseUrl)throw new Error('SUPABASE_URL is required for production migration readiness verification.');
if(!/^[0-9a-f]{40}$/.test(releaseSha))throw new Error('RELEASE_SHA must be the exact 40-character release commit SHA.');
if(!oidcRequestUrl||!oidcRequestToken)throw new Error('GitHub OIDC is unavailable. The workflow must grant id-token: write for credentialless production readiness verification.');

const versions=fs.readdirSync(migrationsDir)
  .map(name=>({name,match:name.match(/^(\d{14})_.*\.sql$/)}))
  .filter(entry=>entry.match && entry.match[1]>=managedFloor)
  .map(entry=>entry.match[1])
  .sort();

if(!versions.length)throw new Error(`No managed production migrations found at or after ${managedFloor}.`);

const tokenUrl=new URL(oidcRequestUrl);
tokenUrl.searchParams.set('audience',audience);
const tokenResponse=await fetch(tokenUrl,{
  headers:{
    Authorization:`Bearer ${oidcRequestToken}`,
    Accept:'application/json',
  },
});
if(!tokenResponse.ok){
  throw new Error(`Unable to obtain GitHub OIDC token for Supabase readiness: HTTP ${tokenResponse.status}.`);
}
const tokenPayload=await tokenResponse.json();
const oidcToken=tokenPayload?.value;
if(typeof oidcToken!=='string'||oidcToken.split('.').length!==3){
  throw new Error('GitHub OIDC endpoint did not return a valid token.');
}

const response=await fetch(`${supabaseUrl}/functions/v1/production-migration-readiness`,{
  method:'POST',
  headers:{
    Authorization:`Bearer ${oidcToken}`,
    'Content-Type':'application/json',
  },
  body:JSON.stringify({versions,expected_sha:releaseSha}),
});

let payload={};
try{payload=await response.json();}catch{}
if(response.status===409){
  const missing=Array.isArray(payload?.missing)?payload.missing:[];
  throw new Error(`Production is missing source-controlled migration versions: ${missing.join(', ')||'unknown'}. Configure deploy credentials or apply those migrations before OTA.`);
}
if(!response.ok){
  throw new Error(`OIDC-protected production migration readiness failed: HTTP ${response.status}.`);
}
if(payload?.ready!==true||payload?.sha!==releaseSha||payload?.checked!==versions.length){
  throw new Error('OIDC-protected production migration readiness returned an inconsistent result.');
}

console.log(`Production migration readiness verified through GitHub OIDC for ${versions.length} managed migrations (${versions[0]}..${versions.at(-1)}).`);
