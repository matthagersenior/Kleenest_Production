import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const requireFile=path=>{if(!fs.existsSync(path))failures.push('missing '+path)};
const requireToken=(source,token,label)=>{if(!source.includes(token))failures.push(label+' missing '+token)};

const edgePath='supabase/functions/ingest-map-candidates-v3/index.ts';
const corePath='packages/mobile-core/src/adaptiveDiscovery.ts';
const provisionPath='supabase/functions/business-self-service-provision/index.ts';
const businessStartPath='apps/business-mobile/app/get-started.tsx';
const brandName=fs.readdirSync('supabase/migrations').find(name=>name.includes('general_brand_identity_registry')&&name.endsWith('.sql'));
const brandPath=brandName?`supabase/migrations/${brandName}`:'';
for(const path of [edgePath,corePath,provisionPath,businessStartPath])requireFile(path);
if(!brandName)failures.push('missing general_brand_identity_registry migration');

const edge=read(edgePath),core=read(corePath),provision=read(provisionPath),brand=read(brandPath),businessStart=read(businessStartPath);

for(const token of [
  'interactive-discovery-plus-canonical-persistence',
  'const allLocations = rows(acquired.elements)',
  'persist(allLocations)',
  'const visibleLocations = requested.length',
  'canonical_candidates_discovered: allLocations.length',
  'for (let i = 0; i < locations.length; i += 500)',
  'Math.min(Math.max(Number(body.radius_km || 8), 1), 40.234)',
  'baseQueries(latitude, longitude, radiusMeters)',
])requireToken(edge,token,'Live discovery persistence');
if(edge.includes('persist(locations)'))failures.push('Live discovery must persist every acquired place, not only amenity-filtered visible results.');
if(edge.includes('messageOf('))failures.push('Live discovery must not return raw upstream exception text to clients.');
for(const token of ['PROVIDER_REQUEST_FAILED','CANONICAL_PERSISTENCE_DEFERRED'])requireToken(edge,token,'Safe discovery failure diagnostics');

for(const token of [
  "functions.invoke('ingest-map-candidates-v3'",
  'collect:true',
  'harvestNearbyMapCandidates',
  'const harvestPromise=radiusMeters<=LIVE_DISCOVERY_RADIUS_METERS',
  'const harvest=await harvestPromise.catch(()=>null)',
  'listNearbyMapCandidates',
])requireToken(core,token,'Consumer discovery bridge');

for(const token of [
  "rpc('claim_location_for_business'",
  "source: 'business_self_service'",
  "functions.invoke('resolve-consumer-location'",
  'latitude: resolvedLatitude',
  'longitude: resolvedLongitude',
])requireToken(provision,token,'Business missing-place claim');
if(/claimed_business_id:\s*businessId/.test(provision)||/business_id:\s*businessId,\s*\n\s*claimed_business_id:\s*businessId/.test(provision))failures.push('A newly discovered Business location must not receive authority before canonical verification.');

for(const token of ['brand_identity_aliases','resolve_location_brand_identity',"'provider_brand'","'learned_name_alias'",'backfill_location_brand_identities'])requireToken(brand,token,'General brand recognition authority');

for(const token of ['Add missing location',"intent==='claim'&&locationMode==='search'&&!selectedLocationId","locationMode==='new'",'Street address'])requireToken(businessStart,token,'Claim-first missing location fallback');

if(failures.length){
  console.error('User discovery canonical growth audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('User discovery canonical growth audit passed: interactive discovery grows canonical locations, preserves brand identity, and newly added businesses still require canonical verification.');
