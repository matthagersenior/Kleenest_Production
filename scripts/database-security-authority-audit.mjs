import fs from 'node:fs';
const internalMigration='supabase/migrations/20260831040000_internal_trigger_authority_hardening.sql';
const fleetMigration='supabase/migrations/20260831043000_fleet_operational_rpc_authority_hardening.sql';
const purchaseMigration='supabase/migrations/20260831044500_single_use_purchase_authority_hardening.sql';
const viewMigration='supabase/migrations/20260831084000_mobile_live_view_security_invoker_hardening.sql';
const fkMigration='supabase/migrations/20260831084500_mobile_live_foreign_key_index_convergence.sql';
const externalObservationMigration='supabase/migrations/20260912052000_external_observation_live_summary_rls_hardening.sql';
const anonSecurityDefinerMigration='supabase/migrations/20260912054500_anon_security_definer_batch1.sql';
const anonSecurityDefinerBatch2Migration='supabase/migrations/20260912060000_anon_security_definer_batch2_helpers.sql';
const publicSecurityInvokerBatch3Migration='supabase/migrations/20260912061500_public_security_invoker_batch3.sql';
const businessLocationCapMigration='supabase/migrations/20260912063000_business_location_cap_auth_only.sql';
const publicSecurityInvokerBatch5Migration='supabase/migrations/20260912065000_public_security_invoker_batch5.sql';
const verificationOpportunitiesMigration='supabase/migrations/20260912070500_verification_opportunities_auth_only.sql';
const publicFunctionDefaultPrivilegesMigration='supabase/migrations/20260912072000_public_function_default_privileges.sql';
const failures=[];
for(const migration of [internalMigration,fleetMigration,purchaseMigration,viewMigration,fkMigration,externalObservationMigration,anonSecurityDefinerMigration,anonSecurityDefinerBatch2Migration,publicSecurityInvokerBatch3Migration,businessLocationCapMigration,publicSecurityInvokerBatch5Migration,verificationOpportunitiesMigration,publicFunctionDefaultPrivilegesMigration])if(!fs.existsSync(migration))failures.push(`missing database security authority migration: ${migration}`);
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

  const fkSql=fs.readFileSync(fkMigration,'utf8');
  const fkIndexes=[
    'external_location_evidence_external_record_id_idx','fleet_dispatch_signal_policies_updated_by_idx','fleet_drivers_user_id_idx',
    'fleet_route_stops_location_id_idx','fleet_route_stops_source_route_stop_id_idx','game_challenges_winner_id_idx',
    'location_departures_location_id_idx','location_occupancy_observations_check_in_id_idx','national_ingestion_runs_market_id_idx',
    'national_ingestion_storage_guard_resume_authorized_by_idx','qr_attribution_events_campaign_id_idx',
    'qr_attribution_events_engagement_program_id_idx','qr_attribution_events_promotion_id_idx','review_reports_resolved_by_idx',
    'review_reports_review_id_idx','verification_streaks_last_location_id_idx'
  ];
  for(const index of fkIndexes)if(!fkSql.includes(`create index if not exists ${index} on public.`))failures.push(`live foreign-key coverage migration missing index: ${index}`);

  const externalObservationSql=fs.readFileSync(externalObservationMigration,'utf8');
  if(!externalObservationSql.includes('alter table public.external_observation_live_summary enable row level security;'))failures.push('external observation live summary must have RLS enabled');
  if(!externalObservationSql.includes('revoke all on table public.external_observation_live_summary from public, anon, authenticated;'))failures.push('external observation live summary must deny direct app-role table access');
  if(!externalObservationSql.includes('create policy external_observation_live_summary_client_deny'))failures.push('external observation live summary must carry an explicit deny-all client policy');
  if(!externalObservationSql.includes('alter view public.restroom_intelligence set (security_invoker = true);'))failures.push('restroom_intelligence must remain security_invoker after external observation hardening');
  if(!externalObservationSql.includes('revoke all on function public.kleenest_location_confidence(uuid)'))failures.push('legacy confidence RPC must not remain publicly executable');
  if(!externalObservationSql.includes('grant execute on function public.kleenest_location_confidence(uuid)'))failures.push('service-role confidence RPC authority must be preserved');

  const anonSecurityDefinerSql=fs.readFileSync(anonSecurityDefinerMigration,'utf8');
  const serviceOnlyFns=[
    '_progression_level_for_xp(bigint)',
    'cold_ingestion_run_archive_ack(uuid[])',
    'cold_ingestion_run_archive_batch(integer)',
    'run_corridor_ingestion_scheduler()',
    'run_corridor_open_data_scheduler()',
  ];
  for(const fn of serviceOnlyFns){
    if(!anonSecurityDefinerSql.includes(`revoke all on function public.${fn}`))failures.push(`${fn} must revoke direct app-role execution`);
    if(!anonSecurityDefinerSql.includes(`grant execute on function public.${fn}`))failures.push(`${fn} must preserve service-role execution`);
  }
  const authenticatedOnlyFns=[
    'attach_discovery_photo(uuid,text,text,bigint,integer,integer)',
    'consumer_active_objectives()',
    'consumer_match_or_create_discovery(jsonb)',
    'consumer_progression_overview()',
    'consumer_progression_rankings(text,text,jsonb)',
    'consumer_record_discovery_evidence(uuid,jsonb)',
    'list_my_blocked_users()',
    'live_network_motif_snapshot(uuid,integer)',
    'record_progression_event_v2(text,jsonb,text)',
    'report_ai_response(text,text,text,text,text,text,text)',
    'require_current_policy_acceptance()',
  ];
  for(const fn of authenticatedOnlyFns){
    if(!anonSecurityDefinerSql.includes(`revoke all on function public.${fn}`))failures.push(`${fn} must revoke anonymous/public execution`);
    if(!anonSecurityDefinerSql.includes(`grant execute on function public.${fn}`))failures.push(`${fn} must preserve authenticated/service execution`);
  }

  const anonSecurityDefinerBatch2Sql=fs.readFileSync(anonSecurityDefinerBatch2Migration,'utf8');
  for(const fn of ['enforce_ugc_policy_acceptance()','users_have_block_relationship(uuid,uuid)']){
    if(!anonSecurityDefinerBatch2Sql.includes(`revoke all on function public.${fn}`))failures.push(`${fn} must reject direct public/app execution`);
    if(!anonSecurityDefinerBatch2Sql.includes(`grant execute on function public.${fn}`))failures.push(`${fn} must retain service-role authority`);
  }

  const publicSecurityInvokerBatch3Sql=fs.readFileSync(publicSecurityInvokerBatch3Migration,'utf8');
  for(const fn of [
    'current_policy_versions()',
    'consumer_nearby_progression_opportunities(double precision,double precision,integer)',
  ]){
    if(!publicSecurityInvokerBatch3Sql.includes(`alter function public.${fn}`))failures.push(`${fn} must be declared in public invoker hardening`);
  }
  if((publicSecurityInvokerBatch3Sql.match(/security invoker;/g)||[]).length<2)failures.push('public invoker batch3 must convert both public RPCs to SECURITY INVOKER');

  const businessLocationCapSql=fs.readFileSync(businessLocationCapMigration,'utf8');
  if(!businessLocationCapSql.includes('revoke all on function public.get_business_location_cap(uuid)'))failures.push('business location cap must revoke PUBLIC/anon execution');
  if(!businessLocationCapSql.includes('grant execute on function public.get_business_location_cap(uuid)'))failures.push('business location cap must preserve authenticated/service execution');

  const publicSecurityInvokerBatch5Sql=fs.readFileSync(publicSecurityInvokerBatch5Migration,'utf8');
  for(const fn of [
    'map_network_nearby_strict_v1(',
    'map_network_nearby_v1(',
    'get_location_trust_conflicts(uuid)',
  ]){
    if(!publicSecurityInvokerBatch5Sql.includes(`alter function public.${fn}`))failures.push(`${fn} must be declared in public invoker batch5`);
  }
  if((publicSecurityInvokerBatch5Sql.match(/security invoker;/g)||[]).length<3)failures.push('public invoker batch5 must convert all three RPCs to SECURITY INVOKER');

  const verificationOpportunitiesSql=fs.readFileSync(verificationOpportunitiesMigration,'utf8');
  for(const fn of [
    'get_location_preventive_verification_opportunities(uuid)',
    'get_location_remediation_confirmation_opportunities(uuid)',
  ]){
    if(!verificationOpportunitiesSql.includes(`revoke all on function public.${fn}`))failures.push(`${fn} must revoke PUBLIC/anon execution`);
    if(!verificationOpportunitiesSql.includes(`grant execute on function public.${fn}`))failures.push(`${fn} must preserve authenticated/service execution`);
  }

  const publicFunctionDefaultPrivilegesSql=fs.readFileSync(publicFunctionDefaultPrivilegesMigration,'utf8');
  if(!/alter default privileges for role postgres in schema public[\s\S]*revoke execute on functions from public, anon, authenticated;/i.test(publicFunctionDefaultPrivilegesSql))failures.push('new public functions must revoke default PUBLIC/anon/authenticated EXECUTE');
  if(!/alter default privileges for role postgres in schema public[\s\S]*grant execute on functions to service_role;/i.test(publicFunctionDefaultPrivilegesSql))failures.push('new public functions must preserve service-role default EXECUTE');

  const migrationDir='supabase/migrations';
  const retiredOwnerRightsViews=['locations_public','review_intelligence_signals','v_ai_business_roi'];
  const futureFacingMigrations=fs.readdirSync(migrationDir).filter(name=>name.endsWith('.sql')&&name>='20260831084000').map(name=>fs.readFileSync(`${migrationDir}/${name}`,'utf8')).join('\n');
  for(const view of retiredOwnerRightsViews){
    const unsafeCreate=new RegExp(`create\\s+(?:or\\s+replace\\s+)?view\\s+public\\.${view}\\b`,'i').test(futureFacingMigrations);
    const hardened=new RegExp(`alter\\s+view\\s+public\\.${view}\\s+set\\s*\\(security_invoker\\s*=\\s*true\\)`,'i').test(futureFacingMigrations);
    if(unsafeCreate&&!hardened)failures.push(`retired owner-rights view ${view} must not be reintroduced without security_invoker=true`);
  }
}
if(failures.length){console.error('Database security authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Database security authority audit passed.');
