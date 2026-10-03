import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const need=(path,token,label)=>{
  const source=read(path);
  if(!source)failures.push('missing '+path);
  else if(!source.includes(token))failures.push(label+' missing '+token);
};

const migration='supabase/migrations/20261001103000_overture_federated_place_discovery.sql';
const ingest='scripts/overture-places-ingest.py';
const workflow='.github/workflows/overture-places-ingest.yml';
const core='packages/mobile-core/src/adaptiveDiscovery.ts';

for(const token of [
  'insert into public.external_data_sources',
  "'overture'",
  'Overture Maps Places',
  'national_ingestion_source_policies',
  'place_discovery_hydration_queue',
  'enqueue_place_discovery_hydration',
  'grant execute on function public.enqueue_place_discovery_hydration',
  'national_ingestion_markets',
])need(migration,token,'Overture source authority');

for(const token of [
  'https://stac.overturemaps.org/catalog.json',
  'theme=places/type=place',
  'read_parquet',
  'basic_category',
  'taxonomy.primary',
  'operating_status',
  'confidence',
  'ingest_external_locations_background',
  'BackgroundIngestionBusy',
  'deferred_control_plane_unavailable',
  '"p_source_key":"overture"',
  'place_discovery_hydration_queue',
  'batch_size = 50',
  'recover_stale_queue',
  'http_timeout_seconds',
  'http_retry_attempts("PATCH", retries=2) == 3',
  'national_ingestion_storage_status',
  'national_ingestion_source_policies',
  'effective_job_limit',
  'MAX_RECORDS_PER_CYCLE = 50',
  'def page_state(',
  'records_seen',
  'partial_progress',
  'has_more',
  'failed_jobs',
])need(ingest,token,'Overture ingestion worker');

for(const token of [
  "cron: '*/10 * * * *'",
  'workflow_dispatch:',
  'workflow_run:',
  'workflows: ["Production CI"]',
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.head_branch == 'main'",
  'KLEENEST_PROD_SERVICE_ROLE_KEY',
  'pip install duckdb',
  'scripts/overture-places-ingest.py',
  "default: '1'",
  '${INPUT_MAX_JOBS:-1}',
])need(workflow,token,'Overture ingestion workflow');

for(const token of [
  "rpc('enqueue_place_discovery_hydration'",
  'queueOvertureHydration',
  'Math.min(40234',
])need(core,token,'Consumer-triggered Overture hydration');

const writeAmp='supabase/migrations/20261003081500_reduce_ingestion_repeat_write_amplification.sql';
for(const token of [
  "interval '24 hours'",
  'location_brand_identities.canonical_brand is distinct from',
  'external_location_records.last_seen_at is null',
  'external_location_records.last_seen_at < now()-interval',
])need(writeAmp,token,'Repeat-write amplification guard');

const archiveWorkflow='.github/workflows/sync-kleenest-data.yml';
for(const token of [
  'actions: read',
  'LAST_SUCCESS',
  'fetch_incremental',
  'order=$time_col.asc,id.asc',
  'github_incremental_overlap',
])need(archiveWorkflow,token,'Incremental data archive sync');
if(read(archiveWorkflow).includes("date -u -d '24 hours ago'"))failures.push('Data archive sync must not rescan a fixed 24-hour window every hour.');

const archiveIndexMigration='supabase/migrations/20261003084000_archive_sync_query_indexes.sql';
for(const token of [
  'external_location_records_archive_sync_idx',
  'last_seen_at,id',
  'external_observations_archive_sync_idx',
  'imported_at,id',
  'national_ingestion_runs_archive_sync_idx',
  'started_at,id',
])need(archiveIndexMigration,token,'Archive sync query indexes');

const ingestSource=read(ingest).toLowerCase();
for(const forbidden of ['places.googleapis.com','maps.googleapis.com/maps/api/place','@googlemaps/places']){
  if(ingestSource.includes(forbidden))failures.push('Overture ingestion must not depend on Google Places endpoint/import '+forbidden);
}

if(failures.length){
  console.error('Federated place discovery audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Federated place discovery audit passed: Overture bulk/on-demand hydration, canonical persistence, and consumer search queueing are wired without Google Places.');
