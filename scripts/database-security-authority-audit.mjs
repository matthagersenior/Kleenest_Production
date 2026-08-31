import fs from 'node:fs';
const internalMigration='supabase/migrations/20260831040000_internal_trigger_authority_hardening.sql';
const fleetMigration='supabase/migrations/20260831043000_fleet_operational_rpc_authority_hardening.sql';
const purchaseMigration='supabase/migrations/20260831044500_single_use_purchase_authority_hardening.sql';
const viewMigration='supabase/migrations/20260831084000_mobile_live_view_security_invoker_hardening.sql';
const failures=[];
for(const migration of [internalMigration,fleetMigration,purchaseMigration,viewMigration])if(!fs.existsSync(migration))failures.push(`missing database security authority migration: ${migration}`);
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

  const purchaseSql=fs.readFileSync(purchaseMigration,'utf8');
  if(!purchaseSql.includes("alter function public.list_single_use_access_purchases() set search_path = '';"))failures.push('purchase history authority must use an empty search path');
  if(!purchaseSql.includes('revoke all on function public.list_single_use_access_purchases() from public, anon;'))failures.push('purchase history must reject public and anonymous execution');
  if(!purchaseSql.includes('grant execute on function public.list_single_use_access_purchases() to authenticated;'))failures.push('purchase history must remain available to authenticated users');

  const viewSql=fs.readFileSync(viewMigration,'utf8');
  const internalViews=['activity_events','location_health','pricing_authority_v1','restroom_intelligence'];
  for(const view of internalViews){
    if(!viewSql.includes(`alter view public.${view} set (security_invoker = true);`))failures.push(`${view} must execute with caller permissions`);
    if(!viewSql.includes(`revoke all on table public.${view} from public, anon, authenticated;`))failures.push(`${view} must remain closed to direct app-role access`);
  }

  const migrationDir='supabase/migrations';
  const retiredOwnerRightsViews=['locations_public','review_intelligence_signals','v_ai_business_roi'];
  const recentMigrations=fs.readdirSync(migrationDir).filter(name=>name.endsWith('.sql')).map(name=>fs.readFileSync(`${migrationDir}/${name}`,'utf8')).join('\n');
  for(const view of retiredOwnerRightsViews){
    const unsafeCreate=new RegExp(`create\\s+(?:or\\s+replace\\s+)?view\\s+public\\.${view}\\b`,'i').test(recentMigrations);
    const hardened=new RegExp(`alter\\s+view\\s+public\\.${view}\\s+set\\s*\\(security_invoker\\s*=\\s*true\\)`,'i').test(recentMigrations);
    if(unsafeCreate&&!hardened)failures.push(`retired owner-rights view ${view} must not be reintroduced without security_invoker=true`);
  }
}
if(failures.length){console.error('Database security authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Database security authority audit passed.');
