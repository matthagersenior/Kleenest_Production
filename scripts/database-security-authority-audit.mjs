import fs from 'node:fs';
const migration='supabase/migrations/20260831040000_internal_trigger_authority_hardening.sql';
const failures=[];
if(!fs.existsSync(migration))failures.push(`missing database security authority migration: ${migration}`);
if(!failures.length){
  const sql=fs.readFileSync(migration,'utf8');
  const triggerFunctions=['converge_fleet_operational_event_to_intelligence','materialize_fleet_geofence_notification','materialize_fleet_operational_notification','sync_external_location_address'];
  for(const fn of triggerFunctions){
    if(!sql.includes(`alter function public.${fn}() set search_path = '';`))failures.push(`${fn} must use an empty search path`);
    if(!sql.includes(`revoke all on function public.${fn}() from public, anon, authenticated;`))failures.push(`${fn} must not be directly executable by app roles`);
  }
  if(!sql.includes('alter view public.place_experience_projection set (security_invoker = true);'))failures.push('place_experience_projection must execute with caller permissions');
}
if(failures.length){console.error('Database security authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Database security authority audit passed.');
