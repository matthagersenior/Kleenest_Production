import fs from 'node:fs';

const failures=[];
const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20260919173000_general_brand_identity_registry.sql');

for(const token of [
  'brand_identity_aliases',
  'normalize_brand_key',
  'resolve_location_brand_identity',
  'refresh_brand_identity_registry',
  "'provider_brand'",
  "'learned_name_alias'",
  "'provider_alias'",
  'trg_locations_resolve_brand_identity',
  'trg_locations_learn_provider_brand',
  'kleenest-brand-registry-refresh',
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
if(!migration.includes("public.brand_display_base")){
  failures.push('Brand learning must normalize store-number suffixes without damaging numeric brand names.');
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
console.log('General brand identity audit passed: arbitrary provider brands are preserved, recognizable repeated commercial identities are learned, generic place names are excluded, and aliases refresh automatically.');
