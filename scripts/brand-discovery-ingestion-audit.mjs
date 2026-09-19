import fs from 'node:fs';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const migration=read('supabase/migrations/20260919150000_ingestion_brand_identity.sql');
for(const token of [
  'add column if not exists brand_name text',
  'add column if not exists operator_name text',
  'normalize_ingestion_brand',
  "'Pizza Hut'",
  "'Circle K'",
  "'QuikTrip'",
  "'Casey''s'",
  "'brand',v_brand",
  "'operator',v_operator",
  'brand_name=coalesce(v_brand',
  'operator_name=coalesce(v_operator',
])if(!migration.includes(token))failures.push('Brand ingestion migration missing '+token);

for(const path of [
  'supabase/functions/national-ingestion-orchestrator/index.ts',
  'supabase/functions/focus-ingestion-orchestrator/index.ts',
]){
  const source=read(path);
  for(const token of ['brand:t.brand||null','operator_name:t.operator||null']){
    if(!source.includes(token))failures.push(`${path} must pass ${token} into canonical ingestion.`);
  }
}

if(failures.length){
  console.error('Brand discovery ingestion audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Brand discovery ingestion audit passed: provider brand/operator identity is preserved and normalized by canonical ingestion.');
