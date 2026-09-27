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
const maxAttempts=36;
const retryDelayMs=5000;
// This historical route projection was never recorded by the native GitHub
// deployer, and applying it after its successor would regress the route RPC.
// The successor completely replaces the same public function and is already
// authoritative in production, so readiness accepts the old version only when
// that exact successor is present in the release source.
const supersededMigrations=new Map([
  ['20260923221800','20260924151211'],
]);

if(!supabaseUrl)throw new Error('SUPABASE_URL is required for production migration readiness verification.');
if(!/^[0-9a-f]{40}$/.test(releaseSha))throw new Error('RELEASE_SHA must be the exact 40-character release commit SHA.');
if(!oidcRequestUrl||!oidcRequestToken)throw new Error('GitHub OIDC is unavailable. The workflow must grant id-token: write for production readiness verification.');

const sourceVersions=fs.readdirSync(migrationsDir)
  .map(name=>({name,match:name.match(/^(\d{14})_.*\.sql$/)}))
  .filter(entry=>entry.match && entry.match[1]>=managedFloor)
  .map(entry=>entry.match[1])
  .sort();

const sourceVersionSet=new Set(sourceVersions);
const superseded=[...supersededMigrations.entries()]
  .filter(([version,successor])=>sourceVersionSet.has(version)&&sourceVersionSet.has(successor));
const supersededSet=new Set(superseded.map(([version])=>version));
const versions=sourceVersions.filter(version=>!supersededSet.has(version));

if(!versions.length)throw new Error(`No managed production migrations found at or after ${managedFloor}.`);
for(const [version,successor] of superseded){
  console.log(`Production ledger readiness: ${version} is superseded by source-controlled ${successor}; verifying the authoritative successor instead of replaying the obsolete function definition.`);
}

const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

async function getOidcToken(){
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
  return oidcToken;
}

for(let attempt=1;attempt<=maxAttempts;attempt+=1){
  const oidcToken=await getOidcToken();
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
    if(attempt<maxAttempts){
      console.log(`Waiting for native Supabase GitHub deployment: ${missing.join(', ')||'managed migration'} not live yet (attempt ${attempt}/${maxAttempts}).`);
      await sleep(retryDelayMs);
      continue;
    }
    throw new Error(`Production is missing source-controlled migration versions after ${maxAttempts} checks: ${missing.join(', ')||'unknown'}. Native Supabase GitHub deployment did not converge; OTA remains blocked.`);
  }

  if(!response.ok){
    throw new Error(`OIDC-protected production migration readiness failed: HTTP ${response.status}.`);
  }
  if(payload?.ready!==true||payload?.sha!==releaseSha||payload?.checked!==versions.length){
    throw new Error('OIDC-protected production migration readiness returned an inconsistent result.');
  }

  console.log(`Production migration readiness verified through GitHub OIDC for ${versions.length} managed migrations (${versions[0]}..${versions.at(-1)}).`);
  process.exit(0);
}

throw new Error('Production migration readiness exhausted retries without a terminal result.');
