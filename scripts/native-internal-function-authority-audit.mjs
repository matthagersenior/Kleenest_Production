import fs from 'node:fs';

const internalMigrationPath='supabase/migrations/20260831070000_mobile_internal_function_execution_authority.sql';
const intelligenceMigrationPath='supabase/migrations/20260831070500_mobile_shared_intelligence_execution_authority.sql';
const failures=[];
for(const file of [internalMigrationPath,intelligenceMigrationPath]) if(!fs.existsSync(file)) failures.push(`missing internal authority migration: ${file}`);
if(!failures.length){
  const migration=fs.readFileSync(internalMigrationPath,'utf8');
  const intelligence=fs.readFileSync(intelligenceMigrationPath,'utf8');
  const triggerOnly=[
    'apply_user_amenity_confirmation()',
    'refresh_restroom_observation_intelligence_trigger()',
    'validate_location_photo_checkin_attribution()',
    'reporting_schedule_init()',
  ];
  const internalHelpers=[
    'is_qualifying_return_visit(uuid, uuid, timestamp with time zone)',
    'is_qualifying_return_visit(uuid, uuid, timestamp with time zone, uuid)',
    'quest_advance_activity(uuid, text, uuid, uuid, uuid, uuid, jsonb)',
    'quest_dispatch_event(uuid, text, uuid, uuid, uuid, uuid, jsonb)',
  ];
  for(const signature of [...triggerOnly,...internalHelpers]){
    if(!migration.includes(`alter function public.${signature} set search_path = '';`)) failures.push(`${signature} must use an empty search_path.`);
    if(!migration.includes(`revoke all on function public.${signature} from public, anon, authenticated;`)) failures.push(`${signature} must not be directly executable by client roles.`);
    if(!migration.includes(`grant execute on function public.${signature} to service_role;`)) failures.push(`${signature} must retain service-role execution authority.`);
  }
  if(!migration.includes('revoke all on function public.run_due_reporting_schedules(uuid) from public, anon, authenticated;')) failures.push('Scheduled reporting execution must not be client-executable.');
  if(!migration.includes('grant execute on function public.run_due_reporting_schedules(uuid) to service_role;')) failures.push('Scheduled reporting execution must retain service-role authority.');
  const sharedMutationHelpers=[
    'compute_bathroom_intelligence(uuid)',
    'reconcile_external_location_evidence(uuid)',
    'refresh_location_trust_state(uuid)',
    'national_ingestion_storage_status()',
    'ingest_external_locations(text, jsonb)',
  ];
  for(const signature of sharedMutationHelpers){
    if(!intelligence.includes(`alter function public.${signature} set search_path = '';`)) failures.push(`${signature} must use an empty search_path.`);
    if(!intelligence.includes(`revoke all on function public.${signature} from public, anon, authenticated;`)) failures.push(`${signature} must not be directly executable by client roles.`);
    if(!intelligence.includes(`grant execute on function public.${signature} to service_role;`)) failures.push(`${signature} must retain service-role execution authority.`);
  }
  const combined=migration+'\n'+intelligence;
  if(/grant execute on function public\.(?:apply_user_amenity_confirmation|refresh_restroom_observation_intelligence_trigger|validate_location_photo_checkin_attribution|reporting_schedule_init|is_qualifying_return_visit|quest_advance_activity|quest_dispatch_event|run_due_reporting_schedules|compute_bathroom_intelligence|reconcile_external_location_evidence|refresh_location_trust_state|national_ingestion_storage_status|ingest_external_locations)\([^;]*\) to authenticated/i.test(combined)) failures.push('Backend-owned internal functions must never be re-granted to authenticated clients.');
}
if(failures.length){console.error('Native internal function authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native internal function authority audit passed.');
