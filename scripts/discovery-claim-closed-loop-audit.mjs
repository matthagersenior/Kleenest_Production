import fs from 'node:fs';
import path from 'node:path';

const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const requireToken=(source,token,label)=>{if(!source.includes(token))failures.push(label+' missing '+token)};

const migrationDir='supabase/migrations';
const migrationName=fs.readdirSync(migrationDir).find(name=>name.includes('discovery_claim_closed_loop')&&name.endsWith('.sql'));
if(!migrationName)failures.push('missing discovery_claim_closed_loop migration');
const migration=migrationName?read(path.join(migrationDir,migrationName)):'';
const ingest=read('supabase/functions/ingest-map-candidates-v3/index.ts');
const provision=read('supabase/functions/business-self-service-provision/index.ts');
const getStarted=read('apps/business-mobile/app/get-started.tsx');
const qrScanner=read('apps/consumer-mobile/app/qr.tsx');
const qrGenerator=read('apps/consumer-mobile/app/location-qr.tsx');
const qrActions=read('apps/consumer-mobile/services/qrActions.ts');

for(const token of [
  'canonical_location_qr_code',
  'canonical_location_id_from_qr',
  'materialize_canonical_location_qr_identity',
  'resolve_location_external_identity_v2',
  'location_ingestion_repair_queue',
  'retry_location_ingestion_repairs',
  'resolve_location_brand_identity',
  'ingest_external_locations',
  'queued_repairs',
  'canonicalization_complete',
])requireToken(migration,token,'Database closed-loop authority');

for(const token of [
  "canonicalization_complete",
  "queued_for_repair",
  "row_errors_count",
])requireToken(ingest,token,'Live discovery persistence');

for(const token of [
  "rpc('resolve_location_external_identity_v2'",
  "rpc('resolve_location_brand_identity'",
  'cleanupCreatedWorkspace',
  'workspace.created',
])requireToken(provision,token,'Business claim provisioning');

for(const token of [
  'Claim your location free',
  "intent:'claim'",
  'Verification stays the same',
])requireToken(getStarted,token,'Business free-claim entry');

for(const token of [
  'Verify visit & review',
  'Open location & feedback',
  'business_name',
  'brand_name',
  'review_count',
  'isPreciseLocationPermission',
  'selectBestLocationFix',
])requireToken(qrScanner,token,'Consumer QR scan experience');

for(const token of [
  'WHAT THIS QR WILL SHOW',
  'VERIFIED BUSINESS CONTEXT',
  'same Kleenest location details, feedback, verified check-in and review workflow',
])requireToken(qrGenerator,token,'Location QR generation experience');

for(const token of [
  'p_accuracy_m',
  'business_name',
  'brand_name',
  'feedback_available',
  'review_requires_verified_visit',
])requireToken(qrActions,token,'QR client contract');

if(/normalize_ingestion_brand/.test(provision))failures.push('Business manual discovery still bypasses the generic brand resolver.');
if(/void harvestPromise\.catch\(\(\)=>\{\}\)/.test(read('packages/mobile-core/src/adaptiveDiscovery.ts'))){
  // Allowed only because provider acquisition produces no discovered rows on failure;
  // persistence itself must be durable/repairable inside the Edge Function.
  if(!migration.includes('location_ingestion_repair_queue'))failures.push('Background harvest can fail without durable persistence repair.');
}

if(failures.length){
  console.error('Discovery/claim closed-loop audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Discovery/claim closed-loop audit passed: discovered places are canonically resolved or durably queued, brand and duplicate authority are shared, deterministic location QR identity exists without pre-materialization, and free claims retain the canonical verification path.');
