import fs from 'node:fs';

const migrationPath='supabase/migrations/20260831070000_mobile_internal_function_execution_authority.sql';
const failures=[];
if(!fs.existsSync(migrationPath)) failures.push(`missing internal function authority migration: ${migrationPath}`);
if(!failures.length){
  const migration=fs.readFileSync(migrationPath,'utf8');
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
  if(/grant execute on function public\.(?:apply_user_amenity_confirmation|refresh_restroom_observation_intelligence_trigger|validate_location_photo_checkin_attribution|reporting_schedule_init|is_qualifying_return_visit|quest_advance_activity|quest_dispatch_event|run_due_reporting_schedules)\([^;]*\) to authenticated/i.test(migration)) failures.push('Internal trigger, quest, and reporting helpers must never be re-granted to authenticated clients.');
}
if(failures.length){console.error('Native internal function authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native internal function authority audit passed.');
