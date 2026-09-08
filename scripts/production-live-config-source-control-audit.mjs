import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const requireFile = (name) => {
  const full = path.join(root, name);
  if (!fs.existsSync(full)) throw new Error(`Required production configuration is not source-controlled: ${name}`);
  return fs.readFileSync(full, 'utf8');
};
const requireText = (source, text, message) => {
  if (!source.includes(text)) throw new Error(message);
};

const adaptive = requireFile('supabase/migrations/20260908042059_adaptive_ingestion_efficiency_and_cold_offload.sql');
requireText(adaptive, 'tune_osm_ingestion_concurrency', 'Adaptive OSM concurrency controller must remain source-controlled.');
requireText(adaptive, "max_requests_per_cycle=1", 'OSM safe baseline concurrency must remain 1 request per cycle.');
requireText(adaptive, "'*/5 * * * *'", 'Adaptive OSM concurrency tuning must remain scheduled every five minutes.');
requireText(adaptive, "'*/30 * * * *'", 'Cold provenance offload must remain scheduled every thirty minutes.');
requireText(adaptive, "disk_observed_fraction'')::numeric >= 0.85", 'Observed-disk compaction trigger must remain at 85%.');

for (const migration of [
  'supabase/migrations/20260907100755_add_geo_catalog_export_state.sql',
  'supabase/migrations/20260907100831_add_geo_catalog_export_batch_protocol.sql',
  'supabase/migrations/20260907100852_schedule_geo_catalog_export.sql',
  'supabase/migrations/20260907100917_fix_geo_catalog_export_uuid_watermark.sql',
  'supabase/migrations/20260907100956_accelerate_geo_catalog_backfill.sql',
  'supabase/migrations/20260907224638_add_cold_external_location_offload_contract.sql',
]) requireFile(migration);

const focus = requireFile('supabase/functions/focus-ingestion-orchestrator/index.ts');
requireText(focus, "corridor:'kc_to_chicago'", 'Focus ingestion must preserve the KC-to-Chicago corridor contract.');
requireText(focus, 'https://overpass-api.de/api/interpreter', 'Primary Overpass endpoint must remain source-controlled.');
requireText(focus, 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'Fallback Overpass endpoint must remain source-controlled.');
requireText(focus, "breaker:'single_429_15m_or_2_consecutive_or_legacy_rate'", 'Endpoint breaker policy must remain source-controlled.');

const geo = requireFile('supabase/functions/geo-catalog-exporter/index.ts');
requireText(geo, 'sxgymblzmwdqnaidbbuq.supabase.co/functions/v1/geo-catalog-receiver', 'Geo catalog exporter must target Kleenest_Data.');
requireText(geo, "geo_catalog_export_ack", 'Geo catalog exporter must acknowledge its watermark after transfer.');

const cold = requireFile('supabase/functions/cold-provenance-offloader/index.ts');
requireText(cold, 'sxgymblzmwdqnaidbbuq.supabase.co/functions/v1/cold-provenance-receiver', 'Cold provenance offloader must target Kleenest_Data.');
requireText(cold, 'cold_external_location_archive_ack', 'Cold provenance offloader must acknowledge and delete transferred rows.');

const sync = requireFile('.github/workflows/sync-kleenest-data.yml');
requireText(sync, "cron: '17 * * * *'", 'Kleenest_Data archive reconciliation workflow must remain hourly.');
requireText(sync, 'KLEENEST_PROD_SERVICE_ROLE_KEY', 'Archive reconciliation must require the Production service-role secret.');
requireText(sync, 'KLEENEST_DATA_SERVICE_ROLE_KEY', 'Archive reconciliation must require the Kleenest_Data service-role secret.');

console.log('Production live configuration source-control audit passed.');
