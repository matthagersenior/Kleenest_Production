import fs from 'node:fs';

const required=[
  'supabase/migrations/20260919154634_checkin_accuracy_envelope_v2.sql',
  'supabase/migrations/20260922082707_owner_sponsored_ad_governance.sql',
  'supabase/migrations/20260922111126_fix_storage_guard_disk_denominator.sql',
  'supabase/migrations/20260922111227_fix_storage_guard_disk_denominator.sql',
  'supabase/migrations/20261002211143_ingestion_throughput_control.sql',
  'supabase/migrations/20261003102000_reconcile_live_schema_and_canonical_metric.sql',
];
const failures=[];
for(const file of required){
  if(!fs.existsSync(file))failures.push(`missing Production-ledger migration anchor: ${file}`);
}
if(fs.existsSync('supabase/migrations/20261002204730_ingestion_throughput_control.sql')){
  failures.push('stale pre-ledger ingestion throughput timestamp 20261002204730 is still active');
}
if(!failures.length){
  const converge=fs.readFileSync(required.at(-1),'utf8');
  for(const token of [
    'kleenest_map_check_in_v2',
    'sponsorship_runtime_settings',
    'owner_set_sponsorship_enabled',
    'owner_review_sponsored_campaign',
    'internal.platform_metrics',
    'locations_canonical_metric_insert',
    'locations_canonical_metric_update',
    'locations_canonical_metric_delete',
    'admin_canonical_location_metric',
  ]){
    if(!converge.includes(token))failures.push(`live-schema convergence migration missing ${token}`);
  }
  const throughput=fs.readFileSync(required[4],'utf8');
  for(const token of [
    'ingest_external_locations_background',
    'pg_try_advisory_xact_lock(812733, 1)',
    "set max_requests_per_cycle=1",
  ]){
    if(!throughput.includes(token))failures.push(`Production-ledger throughput migration missing ${token}`);
  }
}
if(failures.length){
  console.error('Supabase ledger source-anchor audit failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Supabase ledger source-anchor audit passed.');
