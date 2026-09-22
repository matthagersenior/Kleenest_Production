import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireFile=path=>{must(fs.existsSync(path),`missing AdMob health contract file: ${path}`);return read(path)};
const requireAll=(label,source,tokens)=>{for(const token of tokens)must(source.includes(token),`${label}: missing ${token}`)};

const telemetry=requireFile('apps/consumer-mobile/services/admobTelemetry.ts');
const slot=requireFile('apps/consumer-mobile/components/AdMobNativeSlot.native.tsx');
const owner=requireFile('apps/platform-mobile/services/ownerAdmin.ts');
const screen=requireFile('apps/platform-mobile/app/relevance.tsx');
const migration=requireFile('supabase/migrations/20260922110000_admob_health_telemetry.sql');

requireAll('Consumer AdMob telemetry service',telemetry,[
  "rpc('record_admob_telemetry_event'",
  "type AdMobTelemetryEvent",
  "'initialized'",
  "'request'",
  "'fill'",
  "'impression'",
  "'click'",
  "'no_fill'",
  "'load_error'",
  "'consent_blocked'",
  "'initialization_error'",
]);

requireAll('Native AdMob lifecycle telemetry',slot,[
  'NativeAdEventType',
  "recordAdMobTelemetry('request'",
  "recordAdMobTelemetry('fill'",
  'NativeAdEventType.IMPRESSION',
  "recordAdMobTelemetry('impression'",
  'NativeAdEventType.CLICKED',
  "recordAdMobTelemetry('click'",
  "classifyAdMobLoadFailure",
]);

requireAll('Owner AdMob health service',owner,[
  'getOwnerAdMobHealthSnapshot',
  "rpc('owner_admob_health_snapshot'",
]);

requireAll('Owner AdMob health panel',screen,[
  'AdMob Health',
  'Fill rate',
  'Impressions',
  'Clicks',
  'Recent AdMob failures',
  'No AdMob telemetry yet',
]);

requireAll('AdMob telemetry schema',migration,[
  'create table if not exists public.admob_telemetry_events',
  'enable row level security',
  'create or replace function public.record_admob_telemetry_event',
  'create or replace function public.owner_admob_health_snapshot',
  "grant execute on function public.record_admob_telemetry_event",
  "grant execute on function public.owner_admob_health_snapshot",
  'revoke all on public.admob_telemetry_events from anon,authenticated',
  "event_type in ('initialized','request','fill','impression','click','paid','no_fill','load_error','consent_blocked','initialization_error')",
  "'stores_user_id',false",
  "'stores_device_id',false",
  "'stores_location',false",
]);

if(failures.length){
  console.error(`AdMob health telemetry audit failed with ${failures.length} gap(s):`);
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log('AdMob health telemetry audit passed.');
