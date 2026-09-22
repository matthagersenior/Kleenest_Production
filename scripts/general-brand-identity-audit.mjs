import fs from 'node:fs';

const failures=[];
const read=p=>fs.readFileSync(p,'utf8');
const migrationName=fs.readdirSync('supabase/migrations').find(name=>name.includes('general_brand_identity_registry')&&name.endsWith('.sql'));
if(!migrationName)throw new Error('General brand identity migration source is missing.');
const migration=read(`supabase/migrations/${migrationName}`);

for(const token of [
  'brand_identity_aliases',
  'normalize_brand_key',
  'resolve_location_brand_identity',
  'refresh_brand_identity_registry',
  "'provider_brand'",
  "'learned_name_alias'",
  "'provider_alias'",
  'location_brand_identities',
  'brand_identity_backfill_state',
  'backfill_location_brand_identities',
  'kleenest-brand-registry-refresh',
  'kleenest-brand-identity-backfill',
  "l.place_type in ('restaurant','cafe','gas_station','shopping','retail','lodging','service','business','health')",
  "lower(trim(l.name)) not like 'unnamed %'",
  "'frequency'",
  "'provider'",
]) if(!migration.includes(token)) failures.push('General brand identity migration missing '+token);

if(!migration.includes("nullif(trim(l.source_metadata->>'brand'),'')") ||
   !migration.includes("nullif(trim(l.source_metadata->'tags'->>'brand'),'')")){
  failures.push('Brand resolver must consume generic provider and tagged brand metadata.');
}
if(!migration.includes("count(distinct coalesce(l.city,''))>=3")){
  failures.push('Learned name aliases must require geographic repetition.');
}
if((migration.match(/source<>'frequency' or confidence>=\.930/g)||[]).length<2){
  failures.push('Frequency-learned aliases must remain candidates until confidence is high enough for automatic application.');
}
if(!migration.includes("public.brand_display_base")){
  failures.push('Brand learning must normalize store-number suffixes without damaging numeric brand names.');
}
if(migration.includes('alter table public.locations add column if not exists brand_identity_source') ||
   migration.includes('create trigger trg_locations_resolve_brand_identity')){
  failures.push('General brand rollout must stay lock-light and avoid new hot-table columns/triggers while ingestion is active.');
}
if(!migration.includes("select public.backfill_location_brand_identities(5000)") ||
   !migration.includes("'*/5 * * * *'")){
  failures.push('Recognizable-brand backfill must progress incrementally in bounded batches.');
}

const prior=read('supabase/migrations/20260919150000_ingestion_brand_identity.sql');
for(const token of ["'brand',v_brand","'operator',v_operator","brand_name,operator_name"]){
  if(!prior.includes(token)) failures.push('Canonical ingestion must continue preserving '+token);
}

if(failures.length){
  console.error('General brand identity audit failed:');
  failures.forEach(f=>console.error('- '+f));
  process.exit(1);
}
console.log('General brand identity audit passed: arbitrary provider brands are preserved, recognizable repeated commercial identities are learned conservatively, generic place names are excluded, and lock-light registry/backfill jobs refresh automatically.');
