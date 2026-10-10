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
requireText(adaptive, "disk_observed_fraction'')::numeric >= 0.85", 'Observed-disk compaction trigger must remain at 85%.');

for (const migration of [
  'supabase/migrations/20260907100755_add_geo_catalog_export_state.sql',
  'supabase/migrations/20260907100831_add_geo_catalog_export_batch_protocol.sql',
  'supabase/migrations/20260907100852_schedule_geo_catalog_export.sql',
  'supabase/migrations/20260907100917_fix_geo_catalog_export_uuid_watermark.sql',
  'supabase/migrations/20260907100956_accelerate_geo_catalog_backfill.sql',
  'supabase/migrations/20260907224638_add_cold_external_location_offload_contract.sql',
]) requireFile(migration);

const geoRuntime = requireFile('supabase/migrations/20260907113600_reconcile_geo_catalog_sync_runtime.sql');
requireText(geoRuntime, "jsonb_build_object('batches',20,'limit',1000)", 'Geo catalog runtime must preserve the live 20-batch export pacing.');
requireText(geoRuntime, "jobname in ('geo-catalog-export', 'geo_catalog_export_sync')", 'Geo catalog runtime must remove legacy duplicate scheduler names before scheduling.');

const national = requireFile('supabase/functions/national-ingestion-orchestrator/index.ts');
requireText(national, 'INGESTION_PATH_RETIRED', 'Legacy national ingestion must remain explicitly retired.');
requireText(national, 'focus-ingestion-orchestrator + corridor-open-data-ingestor', 'Legacy national ingestion must point operators to the canonical split ingestion paths.');
requireText(national, 'status:410', 'Legacy national ingestion must return Gone instead of resuming bulk writes.');

const frontier = requireFile('supabase/operational-config/kc_chicago_moving_frontier.sql');
for (const market of [
  'focus_corridor_kansas_city',
  'focus_corridor_columbia_mo',
  'focus_corridor_springfield_il',
  'focus_corridor_bloomington_il',
  'focus_corridor_chicago',
  'focus_corridor_springfield_mo_branch',
]) requireText(frontier, market, `Moving-frontier configuration must preserve ${market}.`);
requireText(frontier, 'corridor_0.24_frontier_v1', 'Moving-frontier configuration must preserve its source-controlled seed contract.');

const focus = requireFile('supabase/functions/focus-ingestion-orchestrator/index.ts');
requireText(focus, "const corridor=/^focus_corridor_/", 'Focus ingestion must preserve explicit KC-to-Chicago corridor recognition.');
requireText(focus, "focus_corridor_kansas_city", 'Focus ingestion must preserve KC-to-Chicago corridor priority seeds.');
requireText(focus, "market_kind==='travel_corridor'", 'Focus ingestion must support national travel corridors without removing the legacy corridor.');
requireText(focus, "market_kind==='tourism'", 'Focus ingestion must support national tourism priorities.');
requireText(focus, "status:'national_coverage_v1'", 'Focus ingestion must report the current national coverage runtime version.');
requireText(focus, 'try_acquire_focus_ingestion_lease', 'Focus ingestion must preserve its overlap-suppression lease.');
requireText(focus, 'national_ingestion_storage_status', 'Focus ingestion must remain governed by the storage guard.');
requireText(focus, "storage.data?.may_ingest===false", 'Focus ingestion must stop when the storage guard pauses ingestion.');
for (const endpoint of [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]) requireText(focus, endpoint, `Focus ingestion must keep provider ${endpoint} source-controlled.`);
requireText(focus, "PROVIDER_POOL_VERSION='overpass_pool_v4_failure_rate_breaker'", 'Focus ingestion provider-pool version must remain source-controlled.');
requireText(focus, "breaker:'failure_rate_cooldown'", 'Failure-rate endpoint breaker policy must remain source-controlled.');
requireText(focus, 'canonical_batch_size', 'Background OSM staging must remain bounded by the capacity policy batch size.');
requireText(focus, "rpc('stage_ingestion_candidate_batch'", 'Background OSM writes must flow through staged canonicalization.');
const openData = requireFile('supabase/functions/corridor-open-data-ingestor/index.ts');
requireText(openData, 'get_internal_scheduler_secret', 'Open-data ingestion must preserve scheduler authentication.');
requireText(openData, 'external_ingestion_adapters', 'Open-data ingestion adapter registry must remain source-controlled.');
requireText(openData, "adapter_kind==='socrata'", 'Open-data ingestion must preserve supported civic Socrata adapters.');
if (openData.includes('fused_overture') || openData.includes('runOverture')) {
  throw new Error('Fused Overture ingestion must remain retired; official Overture GeoParquet is canonical.');
}
requireText(openData, 'BACKGROUND_CANONICAL_BATCH=250', 'Civic discovery staging must remain bounded to 250-row candidate batches.');
requireText(openData, "rpc('stage_ingestion_candidate_batch'", 'Civic ingestion must stage candidate batches for the bounded canonical admission pipeline.');

const overtureWorker = requireFile('scripts/overture-places-ingest.py');
requireText(overtureWorker, 'SOURCE_KEY = "overture"', 'Official Overture ingestion must keep one canonical source key.');
requireText(overtureWorker, 'batch_size = 50', 'Overture canonical writes must remain bounded to 50-row batches.');
requireText(overtureWorker, 'recover_stale_queue', 'Overture hydration must recover abandoned running jobs.');
requireText(overtureWorker, 'national_ingestion_storage_status', 'Official Overture ingestion must honor the shared storage guard.');
requireText(overtureWorker, 'national_ingestion_source_policies', 'Official Overture ingestion must honor the shared source policy.');
requireText(overtureWorker, 'effective_job_limit', 'Official Overture ingestion must cap work by source policy.');
requireText(overtureWorker, 'http_timeout_seconds("POST") == 85', 'Overture self-test must preserve the bounded POST timeout contract.');
requireText(overtureWorker, 'http_retry_attempts("PATCH", retries=2) == 3', 'Queue state PATCHes must retry transient transport failures while canonical POSTs remain single-attempt.');
requireText(overtureWorker, 'ingest_external_locations_background', 'Overture writes must use background canonical admission.');
requireText(overtureWorker, 'BackgroundIngestionBusy', 'Overture must explicitly defer when the canonical writer is busy.');
requireText(overtureWorker, 'deferred_control_plane_unavailable', 'Automated Overture runs must defer cleanly when the database control plane is saturated.');
requireText(overtureWorker, 'default=1', 'Automated Overture queue processing must default to one request per worker.');

const throughput = requireFile('supabase/migrations/20261002211143_ingestion_throughput_control.sql');
for (const token of [
  'ingest_external_locations_background',
  'pg_try_advisory_xact_lock(812733, 1)',
  'extensions.st_dwithin(l.geom,v_point,80.0)',
  'candidate_pool as materialized',
  'l.geom <-> c.point',
  "set max_requests_per_cycle=1",
  "schedule=>'0-59/4 * * * *'",
  "schedule=>'13,43 * * * *'",
  "backfill_location_brand_identities(500)",
  "retry_location_ingestion_repairs(25)",
]) requireText(throughput, token, `Ingestion throughput control missing ${token}.`);

const overtureWorkflow = requireFile('.github/workflows/overture-places-ingest.yml');
requireText(overtureWorkflow, "cron: '*/10 * * * *'", 'Overture worker cadence must remain ten minutes.');
requireText(overtureWorkflow, "default: '1'", 'Overture worker must process one queued request per automatic cycle.');
requireText(overtureWorkflow, '${INPUT_MAX_JOBS:-1}', 'Overture runtime fallback must remain one queued request.');

const brandRepair = requireFile('supabase/migrations/20261002212000_target_brand_identity_repair.sql');
for (const token of [
  'locations_brand_identity_repair_candidate_idx',
  'explicit_brand_evidence_only',
  "'locations_updated',0",
  "schedule=>'43 * * * *'",
  'backfill_location_brand_identities(100)',
]) requireText(brandRepair, token, `Targeted brand identity repair missing ${token}.`);
if (brandRepair.includes('set brand_name=') || brandRepair.includes('updated_at=now() from public.location_brand_identities')) {
  throw new Error('Historical brand repair must not rewrite canonical location rows.');
}

const ingestionAuthority = requireFile('supabase/migrations/20261002195120_consolidate_ingestion_authority.sql');
requireText(ingestionAuthority, "source_key='overture_places'", 'Legacy Fused Overture source must remain explicitly retired.');
requireText(ingestionAuthority, "adapter_kind = any (array['socrata'::text,'arcgis'::text,'geojson'::text,'bulk'::text])", 'Open-data adapter kinds must exclude retired Fused Overture.');
requireText(ingestionAuthority, "last_error='STALE_WORKER_RECOVERED'", 'Hydration migration must preserve stale-job recovery.');

const canonicalNoopGuard = requireFile('supabase/migrations/20261002195508_avoid_noop_canonical_location_updates.sql');
requireText(canonicalNoopGuard, 'is distinct from row(', 'Canonical ingestion must suppress no-op location rewrites.');
requireText(canonicalNoopGuard, 'get diagnostics v_changed=row_count', 'Canonical ingestion must report only material location updates.');

const dataWorker = requireFile('supabase/kleenest-data/migrations/20261003185511_enable_worker_geo_and_cron.sql');
requireText(dataWorker, 'create extension if not exists postgis', 'Kleenest_Data worker must retain PostGIS for shared geo processing.');
requireText(dataWorker, 'create extension if not exists pg_cron', 'Kleenest_Data worker must retain pg_cron for shared scheduled processing.');

const localArchiveManifest = requireFile('supabase/migrations/20261003185321_add_local_verified_archive_manifest.sql');
requireText(localArchiveManifest, 'archive.object_manifests', 'Production must retain verified local archive manifest support.');
requireText(localArchiveManifest, 'register_archive_object_manifest', 'Production must retain service-role archive manifest registration.');

const geo = requireFile('supabase/functions/geo-catalog-exporter/index.ts');
requireText(geo, 'sxgymblzmwdqnaidbbuq.supabase.co/functions/v1/geo-catalog-receiver', 'Geo catalog exporter must hand shared geo worker load to Kleenest_Data.');
requireText(geo, "storage:'hot_worker_mirror'", 'Geo catalog exporter must identify the Kleenest_Data hot worker mirror path.');
requireText(geo, "geo_catalog_export_ack", 'Geo catalog exporter must acknowledge its watermark after transfer.');

const cold = requireFile('supabase/functions/cold-provenance-offloader/index.ts');
requireText(cold, 'sxgymblzmwdqnaidbbuq.supabase.co/functions/v1/archive-object-ingest', 'Cold provenance offloader must target the verified Kleenest_Data object archive.');
requireText(cold, 'cold_external_location_archive_ack', 'Cold provenance offloader must acknowledge and delete transferred rows.');

const legacyArchive = requireFile('supabase/functions/kleenest-archive-exporter/index.ts');
requireText(legacyArchive, 'disabled: true', 'Legacy archive exporter must remain disabled after migration to GitHub Actions synchronization.');
requireText(legacyArchive, 'Replaced by GitHub Actions Kleenest_Data sync', 'Legacy archive exporter tombstone must document the canonical Kleenest_Data synchronization path.');
requireText(legacyArchive, 'status: 410', 'Legacy archive exporter must continue returning Gone rather than resuming writes.');

const sync = requireFile('.github/workflows/sync-kleenest-data.yml');
requireText(sync, "cron: '17 * * * *'", 'Kleenest_Data archive reconciliation workflow must remain hourly.');
requireText(sync, 'KLEENEST_PROD_SERVICE_ROLE_KEY', 'Archive reconciliation must require the Production service-role secret.');
requireText(sync, 'KLEENEST_DATA_SERVICE_ROLE_KEY', 'Archive reconciliation must require the Kleenest_Data service-role secret.');
requireText(sync, '/functions/v1/archive-object-ingest', 'Archive reconciliation must write verified Storage objects rather than relational mirror rows.');


// Keep the Kleenest_Data source migration ledger aligned with the 15 live-applied versions.
for (const name of [
  "20260907065036_create_kleenest_data_archive_core",
  "20260907065208_add_archive_batch_ingest_rpc",
  "20260907070731_harden_kleenest_archive_receiver",
  "20260907071025_restrict_rls_auto_enable",
  "20260907100540_create_compact_geo_data_tier",
  "20260907100551_add_internal_geo_archive_auth",
  "20260907100620_add_geo_archive_batch_upsert",
  "20260907224607_create_cold_external_location_archive",
  "20260910163656_thin_geo_archive_remove_unused_read_indexes",
  "20260910164712_consolidate_cold_provenance_into_canonical_archive",
  "20260911053104_ingest_archived_ingestion_runs_rpc",
  "20260911104123_fix_cold_external_location_natural_key_upsert",
  "20261003185511_enable_worker_geo_and_cron",
  "20261003201746_coordinate_data_plane_workers",
  "20261004125629_reduce_geo_archive_write_amplification"
]) {
  requireFile(`supabase/kleenest-data/migrations/${name}.sql`);
}
const archiveReceiver = requireFile('supabase/kleenest-data/migrations/20260907070731_harden_kleenest_archive_receiver.sql');
requireText(archiveReceiver, 'archive_ingest_authenticated', 'Data archive receiver authentication must remain source-controlled.');
if (archiveReceiver.includes('vault.create_secret(') || archiveReceiver.includes('vault.update_secret(')) {
  throw new Error('Never source-control Kleenest_Data archive Vault secret values.');
}

console.log('Production live configuration source-control audit passed.');
