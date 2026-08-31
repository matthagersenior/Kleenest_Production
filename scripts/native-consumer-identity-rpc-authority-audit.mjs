import fs from 'node:fs';

const migrationPath='supabase/migrations/20260831071500_mobile_consumer_identity_rpc_search_path_hardening.sql';
const failures=[];
if(!fs.existsSync(migrationPath)) failures.push(`missing consumer identity RPC migration: ${migrationPath}`);
if(!failures.length){
  const migration=fs.readFileSync(migrationPath,'utf8');
  const signatures=[
    'consumer_evidence_loop_health(p_user_id uuid default auth.uid())',
    'family_has_premium_access(p_user_id uuid)',
    'record_favorite_route_event(p_location_id uuid, p_user_id uuid default null, p_from_lat numeric default null, p_from_lng numeric default null)',
    "record_feature_access(p_feature_code text, p_outcome text, p_tier_code text default null, p_destination text default null, p_metadata jsonb default '{}'::jsonb)",
  ];
  for(const signature of signatures){
    const marker=`function public.${signature}`;
    const start=migration.indexOf(marker);
    if(start<0){ failures.push(`${signature} must be defined in the hardening migration.`); continue; }
    const next=migration.indexOf('create or replace function public.',start+marker.length);
    const block=migration.slice(start,next<0?migration.length:next);
    if(!block.includes("set search_path = ''")) failures.push(`${signature} must use an empty search_path.`);
  }
  if(!migration.includes("p_user_id is distinct from auth.uid()")) failures.push('consumer evidence health must reject cross-user identity.');
  if(!migration.includes("p_user_id is distinct from v_user")) failures.push('favorite route telemetry must reject cross-user identity.');
  if(!migration.includes('p_user_id=auth.uid()')) failures.push('family premium access must remain self-scoped.');
  if(!migration.includes("values(auth.uid(),p_feature_code")) failures.push('feature-access telemetry must derive user identity from auth.uid().');
  for(const signature of ['consumer_evidence_loop_health(uuid)','family_has_premium_access(uuid)','record_favorite_route_event(uuid,uuid,numeric,numeric)','record_feature_access(text,text,text,text,jsonb)']){
    if(!migration.includes(`revoke all on function public.${signature} from public, anon;`)) failures.push(`${signature} must deny public/anon execution.`);
    if(!migration.includes(`grant execute on function public.${signature} to authenticated, service_role;`)) failures.push(`${signature} must retain authenticated/service execution.`);
  }
}
if(failures.length){console.error('Native consumer identity RPC authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native consumer identity RPC authority audit passed.');
