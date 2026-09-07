import fs from 'node:fs';

const failures=[];
const files={
  telemetry:'apps/consumer-mobile/services/consumerTelemetry.ts',
  exploreEntry:'apps/consumer-mobile/app/explore.tsx',
  adaptiveExplore:'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  saved:'apps/consumer-mobile/app/saved.tsx',
  location:'apps/consumer-mobile/app/location/[id].tsx',
};
for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`Missing ${name} consumer data-production file: ${file}`);
if(!failures.length){
  const read=file=>fs.readFileSync(file,'utf8');
  const telemetry=read(files.telemetry),exploreEntry=read(files.exploreEntry),adaptiveExplore=read(files.adaptiveExplore),saved=read(files.saved),location=read(files.location);
  const explore=`${exploreEntry}\n${adaptiveExplore}`;
  if(!exploreEntry.includes('AdaptiveExploreScreen'))failures.push('Explore entry must resolve to the canonical adaptive Explore implementation.');
  for(const token of ["rpc('record_location_discovery_event'","rpc('record_location_route_event'",'captureConsumerDiscovery','captureConsumerRouteIntent'])if(!telemetry.includes(token))failures.push(`Consumer telemetry adapter missing ${token}.`);
  if(telemetry.includes('record_data_feature_event'))failures.push('Consumer mobile must never call the privileged data-feature event RPC directly.');
  if(telemetry.includes('p_search')||telemetry.includes('p_query')||telemetry.includes('value_text'))failures.push('Discovery telemetry must not transmit raw search text.');
  for(const token of ["'native_mobile'","'search'","'amenity_filter'",'p_discovered_count','p_radius_km'])if(!telemetry.includes(token))failures.push(`Discovery telemetry missing privacy-safe context: ${token}.`);
  if(!telemetry.includes('void recordConsumerDiscovery(input).catch(()=>{})')||!telemetry.includes('void recordConsumerRouteIntent(locationId,options).catch(()=>{})'))failures.push('Consumer telemetry must remain fire-and-forget so analytics cannot block the user journey.');
  const hasDiscoveryCall=/captureConsumerDiscovery\s*\(\s*\{/.test(explore);
  const hasResultCount=/resultCount\s*:\s*enriched\.length/.test(explore);
  const hasAmenityCount=/amenityCount\s*:\s*selectedAmenityNames\.length/.test(explore);
  if(!hasDiscoveryCall||!hasResultCount||!hasAmenityCount)failures.push('Explore must capture privacy-safe discovery outcomes after canonical nearby results resolve.');
  if(!explore.includes('captureConsumerRouteIntent(id)')||!explore.includes('addToRoute(selected)')||!explore.includes('directions(selected)'))failures.push('Explore route and directions intent must feed the canonical route-event authority.');
  if(!saved.includes("captureConsumerRouteIntent(id,{fromFavorite:true})"))failures.push('Saved route intent must preserve favorite-origin attribution.');
  if(!location.includes('mobileCheckIn')||!location.includes('createMobileReview')||!location.includes('recordReviewAmenityInventory')||!location.includes('uploadReviewPhotos'))failures.push('High-value consumer evidence production must remain canonical and server-backed.');
  if(/business_|fleet_|enterprise_|admin_/i.test(telemetry))failures.push('Consumer telemetry adapter must not couple to Operations namespaces.');
}
if(failures.length){console.error('Consumer data production audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Consumer data production audit passed.');
