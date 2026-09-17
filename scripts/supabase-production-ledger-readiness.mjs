import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const migrationsDir=path.join(root,'supabase','migrations');
const managedFloor='20260917061009';
const supabaseUrl=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY||'';

if(!supabaseUrl)throw new Error('SUPABASE_URL is required for production migration readiness verification.');
if(!publishableKey)throw new Error('SUPABASE_PUBLISHABLE_KEY is required for production migration readiness verification.');

const versions=fs.readdirSync(migrationsDir)
  .map(name=>({name,match:name.match(/^(\d{14})_.*\.sql$/)}))
  .filter(entry=>entry.match && entry.match[1]>=managedFloor)
  .map(entry=>entry.match[1])
  .sort();

if(!versions.length)throw new Error(`No managed production migrations found at or after ${managedFloor}.`);

const missing=[];
for(const version of versions){
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/production_migration_applied`,{
    method:'POST',
    headers:{
      apikey:publishableKey,
      Authorization:`Bearer ${publishableKey}`,
      'Content-Type':'application/json',
    },
    body:JSON.stringify({p_version:version}),
  });
  if(!response.ok){
    const detail=await response.text();
    throw new Error(`Production migration readiness probe failed for ${version}: HTTP ${response.status} ${detail}`);
  }
  const payload=await response.json();
  const applied=payload===true || (Array.isArray(payload) && payload[0]===true);
  if(!applied)missing.push(version);
}

if(missing.length){
  throw new Error(`Production is missing source-controlled migration versions: ${missing.join(', ')}. Configure deploy credentials or apply those migrations before OTA.`);
}

console.log(`Production migration readiness verified for ${versions.length} managed migrations (${versions[0]}..${versions.at(-1)}).`);
