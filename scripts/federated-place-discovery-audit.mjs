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
  'ingest_external_locations',
  '"p_source_key":"overture"',
  'place_discovery_hydration_queue',
  'batch_size=500',
])need(ingest,token,'Overture ingestion worker');

for(const token of [
  "cron: '*/15 * * * *'",
  'workflow_dispatch:',
  'KLEENEST_PROD_SERVICE_ROLE_KEY',
  'pip install duckdb',
  'scripts/overture-places-ingest.py',
])need(workflow,token,'Overture ingestion workflow');

for(const token of [
  "rpc('enqueue_place_discovery_hydration'",
  'queueOvertureHydration',
  'Math.min(40234',
])need(core,token,'Consumer-triggered Overture hydration');

if(read(ingest).toLowerCase().includes('google places'))failures.push('Overture ingestion must not depend on Google Places.');

if(failures.length){
  console.error('Federated place discovery audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Federated place discovery audit passed: Overture bulk/on-demand hydration, canonical persistence, and consumer search queueing are wired without Google Places.');
