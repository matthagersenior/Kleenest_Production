import fs from 'node:fs';
const internalMigration='supabase/migrations/20260831040000_internal_trigger_authority_hardening.sql';
const fleetMigration='supabase/migrations/20260831043000_fleet_operational_rpc_authority_hardening.sql';
const failures=[];
for(const migration of [internalMigration,fleetMigration])if(!fs.existsSync(migration))failures.push(`missing database security authority migration: ${migration}`);
if(!failures.length){
  const internalSql=fs.readFileSync(internalMigration,'utf8');
  const triggerFunctions=['converge_fleet_operational_event_to_intelligence','materialize_fleet_geofence_notification','materialize_fleet_operational_notification','sync_external_location_address'];
  for(const fn of triggerFunctions){
    if(!internalSql.includes(`alter function public.${fn}() set search_path = '';`))failures.push(`${fn} must use an empty search path`);
    if(!internalSql.includes(`revoke all on function public.${fn}() from public, anon, authenticated;`))failures.push(`${fn} must not be directly executable by app roles`);
  }
  if(!internalSql.includes('alter view public.place_experience_projection set (security_invoker = true);'))failures.push('place_experience_projection must execute with caller permissions');

  const fleetSql=fs.readFileSync(fleetMigration,'utf8');
  const fleetFunctions=[
    ['fleet_assign_driver_user','uuid,uuid,uuid'],
    ['fleet_record_route_stop_timing','uuid,uuid,uuid,text,timestamptz'],
    ['fleet_route_performance','uuid,uuid'],
    ['fleet_set_route_stops','uuid,uuid,jsonb'],
  ];
  for(const [fn,args] of fleetFunctions){
    if(!fleetSql.includes(`alter function public.${fn}(${args}) set search_path = '';`))failures.push(`${fn} must use an empty search path`);
    if(!fleetSql.includes(`revoke all on function public.${fn}(${args}) from public, anon;`))failures.push(`${fn} must reject public and anonymous execution`);
    if(!fleetSql.includes(`grant execute on function public.${fn}(${args}) to authenticated;`))failures.push(`${fn} must preserve authenticated execution`);
  }
}
if(failures.length){console.error('Database security authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Database security authority audit passed.');
