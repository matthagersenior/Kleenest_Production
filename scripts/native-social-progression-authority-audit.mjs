import fs from 'node:fs';

const migrationPath='supabase/migrations/20260831072000_mobile_legacy_follow_progression_convergence.sql';
const failures=[];
if(!fs.existsSync(migrationPath)) failures.push(`missing social progression migration: ${migrationPath}`);
if(!failures.length){
  const migration=fs.readFileSync(migrationPath,'utf8');
  for(const signature of ['follow_user(p_user_id uuid)','unfollow_user(p_target_user_id uuid)']){
    const marker=`function public.${signature}`;
    const start=migration.indexOf(marker);
    if(start<0){failures.push(`${signature} must remain defined for compatibility.`);continue;}
    const next=migration.indexOf('create or replace function public.',start+marker.length);
    const block=migration.slice(start,next<0?migration.length:next);
    if(!block.includes("set search_path = ''")) failures.push(`${signature} must use an empty search_path.`);
  }
  if(migration.includes("award_gamification_points('follow')")) failures.push('Legacy follow_user must not award progression directly.');
  if(!migration.includes('v_result:=public.toggle_follow_user(p_user_id);')) failures.push('Legacy follow_user must delegate new follows to canonical toggle_follow_user.');
  if(!migration.includes('get diagnostics v_affected = row_count;')) failures.push('Legacy unfollow_user must use integer row-count handling.');
  if(!migration.includes('delete from public.follows where follower_id=v_user and following_id=p_target_user_id;')) failures.push('Legacy unfollow_user must remain self-scoped.');
  for(const signature of ['follow_user(uuid)','unfollow_user(uuid)']){
    if(!migration.includes(`revoke all on function public.${signature} from public, anon;`)) failures.push(`${signature} must deny public/anon execution.`);
    if(!migration.includes(`grant execute on function public.${signature} to authenticated, service_role;`)) failures.push(`${signature} must preserve authenticated compatibility.`);
  }
}
if(failures.length){console.error('Native social progression authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native social progression authority audit passed.');
