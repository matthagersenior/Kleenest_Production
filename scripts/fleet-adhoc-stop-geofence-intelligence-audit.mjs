import fs from 'node:fs';
const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const migration='supabase/migrations/20260911093000_fleet_adhoc_stops_geofence_intelligence.sql';

for(const file of [migration,'apps/fleet-mobile/app/planner.tsx','apps/fleet-mobile/services/locations.ts','apps/business-mobile/services/product.ts','apps/business-mobile/app/index.tsx']){
  if(!fs.existsSync(file))failures.push('missing '+file);
}
const sql=read(migration);
for(const token of [
  'stop_kind','stop_name','stop_address','latitude','longitude',
  'geofence_radius_m','notify_arrival','notify_departure','notify_dwell',
  'route_stop_id','business_geofences',
  'fleet_set_route_stops','fleet_route_geofence_manifest',
  'record_geofence_event','fleet_route_performance','fleet_dispatch_intelligence',
  "prevention_priority"
]) if(!sql.includes(token)) failures.push('migration missing '+token);

const planner=read('apps/fleet-mobile/app/planner.tsx');
for(const token of [
  'Location.geocodeAsync',
  'Use this place as an ad-hoc stop',
  'AD-HOC STOP',
  'Geofence radius',
  'Notify arrival',
  'Notify departure',
  'Notify dwell',
  "source_kind:'adhoc'",
  'stop_name',
  'stop_address'
]) if(!planner.includes(token)) failures.push('planner missing '+token);

const loc=read('apps/fleet-mobile/services/locations.ts');
for(const token of ['source_kind','ad_hoc','routeLocationId']) if(!loc.includes(token)) failures.push('locations service missing '+token);

const product=read('apps/business-mobile/services/product.ts');
for(const token of ['degradedServices','preventive work orders']) if(!product.includes(token)) failures.push('Business operations diagnostics missing '+token);

const home=read('apps/business-mobile/app/index.tsx');
for(const token of ['degradedServices','temporarily unavailable']) if(!home.includes(token)) failures.push('Business Home degraded-service message missing '+token);
if(home.includes("Some operational services are degraded; available controls remain active.")) failures.push('generic degraded banner still present');

if(failures.length){
  console.error('Fleet ad-hoc stop/geofence intelligence audit failed:');
  for(const f of failures)console.error('- '+f);
  process.exit(1);
}
console.log('Fleet ad-hoc stop/geofence intelligence audit passed.');
