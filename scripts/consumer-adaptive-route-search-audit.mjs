import fs from 'node:fs';

const paths={
  screen:'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  route:'apps/consumer-mobile/app/route.tsx',
  entry:'apps/consumer-mobile/app/explore.tsx',
  signals:'apps/consumer-mobile/components/RestroomSignals.tsx',
  core:'packages/mobile-core/src/adaptiveDiscovery.ts',
  publicEntry:'packages/mobile-core/src/publicEntry.ts',
  cache:'apps/consumer-mobile/services/nearbyCache.ts',
  migration:'supabase/migrations/20260906052000_consumer_adaptive_route_search.sql',
  densityMigration:'supabase/migrations/20260914165745_density_adaptive_discovery_ranking.sql',
  densityCompatMigration:'supabase/migrations/20260914170001_density_discovery_anon_compat.sql',
  densitySafeMigration:'supabase/migrations/20260914170218_density_discovery_safe_v3_projection.sql',
};
for(const [label,path] of Object.entries(paths))if(!fs.existsSync(path))throw new Error(`${label} adaptive-search authority missing: ${path}`);
const read=path=>fs.readFileSync(path,'utf8');
const requireToken=(text,token,label)=>{if(!text.includes(token))throw new Error(`${label} missing ${token}`)};
const screen=read(paths.screen), entry=read(paths.entry), signals=read(paths.signals), core=read(paths.core), publicEntry=read(paths.publicEntry), cache=read(paths.cache), migration=read(paths.migration), densityMigration=read(paths.densityMigration), densityCompatMigration=read(paths.densityCompatMigration), densitySafeMigration=read(paths.densitySafeMigration);

for(const token of ['1 mi','2 mi','5 mi','10 mi','25 mi','50 mi','100 mi','250 mi','Must include all','Include any','Expand for required amenities','Maximum distance','Nearby','Along route','findAdaptiveNearbyRestrooms','listRestroomsAlongRoute','buildMobileRoute','kleenest.native.route.draft','distance_to_route_meters','route_fraction','Full details','Add to route','Start navigation'])requireToken(screen,token,'Consumer adaptive Explore');
for(const token of ['AdaptiveExploreScreen'])requireToken(entry,token,'Consumer Explore entry');
for(const token of ['CompactRestroomSignals','RestroomSignals'])requireToken(signals,token,'Consumer restroom signal presentation');
for(const token of ['map_network_nearby_v3','map_network_along_route_v1','AmenityMatchRule','findAdaptiveNearbyRestrooms','listRestroomsAlongRoute','402336','DENSE_LOCAL_RESULT_COUNT','MODERATE_LOCAL_RESULT_COUNT','hardRadius','Math.min(500'])requireToken(core,token,'Mobile discovery core');
requireToken(publicEntry,"export * from './adaptiveDiscovery';",'Mobile public entry');
requireToken(cache,'rows.slice(0,500)','Dense nearby cache must preserve the full 500-row discovery window');
for(const token of ['map_network_nearby_v3','map_network_along_route_v1','p_amenity_match','SECURITY INVOKER','REVOKE ALL ON FUNCTION','GRANT EXECUTE ON FUNCTION','anon, authenticated','402336','40234','jsonb_array_length','ST_DWithin','route_fraction','distance_to_route_meters'])requireToken(migration,token,'Adaptive discovery migration');
if(migration.includes('SECURITY DEFINER'))throw new Error('Adaptive discovery RPCs must not use SECURITY DEFINER.');
if(/execute\s+format|\bEXECUTE\s+[^;]*\|\|/i.test(migration))throw new Error('Adaptive discovery migration must not use dynamic SQL.');
for(const token of ['p_limit > 500','business_tier','kleenest_business','402336'])requireToken(densityMigration,token,'Density-adaptive discovery migration');
for(const token of ['security invoker','p_limit > 500','anon,authenticated,service_role'])requireToken(densityCompatMigration.toLowerCase(),token,'Density discovery anonymous compatibility migration');
for(const token of ['security invoker','map_network_nearby_v2','jsonb_array_elements','p_limit > 500','anon,authenticated,service_role'])requireToken(densitySafeMigration.toLowerCase(),token,'Density discovery safe V3 projection migration');
if(densitySafeMigration.includes('from public.locations'))throw new Error('Final public V3 discovery must read through the sanitized V2 projection, not raw locations.');
if(/TODO|coming soon|not implemented|placeholder\s+(?:implementation|behavior|logic|code|handler)/i.test(screen+core+migration+densityMigration+densityCompatMigration+densitySafeMigration))throw new Error('Adaptive discovery cannot ship placeholder/TODO behavior.');
if(!screen.includes("matchRule === 'all'")||!screen.includes('selectedAmenityNames.length'))throw new Error('Amenity all/any controls are not wired to selected amenities.');
if(!screen.includes('useState(1609)'))throw new Error('Nearby discovery must start at the dense-area 1 mile default.');
if(!screen.includes('selectedAmenityNames.length ? autoExpand : true'))throw new Error('Default discovery must keep expanding when local supply is sparse.');
if(!screen.includes('hardRadius: selectedAmenityNames.length > 0 && !autoExpand'))throw new Error('Zero-result hard radius behavior must be reserved for explicit amenity-constrained searches.');
if(!screen.includes('useState(402336)'))throw new Error('Adaptive discovery must retain the supported 250 mile fallback ceiling.');
if(!screen.includes('organizeDiscoveryRows')||!screen.includes('freshness → Kleenest → amenities'))throw new Error('Nearby results must be organized Freshness → Kleenest → Amenities before distance.');
if(!screen.includes('RECOMMENDED'))throw new Error('Discovery must visually identify its recommended nearby result.');
if(!screen.includes('effectiveRadiusMeters')||!screen.includes('attemptedRadiiMeters')||!screen.includes('densityClass'))throw new Error('Adaptive expansion and density provenance is not surfaced to the UI.');
if(!screen.includes('route.distanceMiles')||!screen.includes('route.durationMinutes'))throw new Error('Along-route distance/ETA must derive from actual built-route totals.');

// Explore is one continuous consumer page: compact search controls → map → results.
// Detailed qualification controls live in a dismissible filter menu so the map stays high.
for(const token of [
  'const [showAdvanced, setShowAdvanced] = useState(false);',
  'accessibilityLabel="Nearby search"',
  'accessibilityLabel="Along route search"',
  'accessibilityLabel="Filter places"',
  'Filter places',
  'Everything',
  'Kleenest places',
  'Progression',
  'minimumStars',
  'freshnessDays',
  'listNearbyProgressionOpportunities',
  'visibleRows',
  '<Modal',
  'visible={showAdvanced}',
  'MapLegend',
  'Close selected location',
  '<CompactRestroomSignals',
  '<FlatList',
  'ListHeaderComponent={',
  'refreshControl={<RefreshControl',
  'onDirections={() => void directions(item)}',
  'onAddToRoute={() => addToRoute(item)}',
  'onDetails={() => router.push',
  'selectedRoutePosition',
  'RequestedAmenityMatches',
  'requestedAmenities={selectedAmenityNames}',
])requireToken(screen,token,'Consumer compact-filter Explore composition');

if(screen.includes('Scroll results · map stays fixed'))throw new Error('Consumer Explore must not describe or implement a fixed-map/separate-results scrolling model.');
if((screen.match(/<FlatList/g)||[]).length!==1)throw new Error('Consumer Explore must use exactly one primary virtualized vertical scroll surface.');

const modeIndex=screen.indexOf('accessibilityLabel="Nearby search"');
const filterButtonIndex=screen.indexOf('accessibilityLabel="Filter places"');
const mapIndex=screen.indexOf('<View style={s.mapSection}>');
const listHeaderIndex=screen.indexOf('ListHeaderComponent={');
const resultsIndex=screen.indexOf('NEARBY OPTIONS');
const renderItemIndex=screen.indexOf('renderItem={({ item })');
if(!(listHeaderIndex>0&&modeIndex>listHeaderIndex&&filterButtonIndex>modeIndex&&mapIndex>filterButtonIndex&&resultsIndex>mapIndex&&renderItemIndex>resultsIndex))throw new Error('Consumer Explore must preserve compact controls → map → results ordering inside the single virtualized scroll surface.');

const filterModalStart=screen.indexOf('<Modal');
const filterModalEnd=screen.indexOf('</Modal>',filterModalStart);
const filterModal=screen.slice(filterModalStart,filterModalEnd);
for(const token of ['Starting radius','What matters on this stop?','Expand for required amenities','Maximum distance','Route corridor','Must include all','Include any','Kleenest places','Progression','Stars','Freshness']){
  if(!filterModal.includes(token))throw new Error(`Consumer Explore must keep ${token} inside the filter modal disclosure.`);
}
if(!filterModal.includes('filterAmenities.map'))throw new Error('Amenity chips must move into the filter modal so the map rises on the page.');
if(!filterModal.includes('radiusChoices.map'))throw new Error('Radius controls must move into the filter modal so the map rises on the page.');
if(!screen.includes('<View pointerEvents="auto" style={[s.selectedPanel'))throw new Error('Selected map-pin panel must own touch events so its close control works above the native map.');
if(!screen.includes("selectedPanel: { position: 'absolute', left: 9, right: 54, bottom: 9, zIndex: 40, elevation: 12"))throw new Error('Selected map-pin panel must render above the native map interaction surface.');
if(!screen.includes("close: { minWidth: 72, minHeight: 44, zIndex: 41, elevation: 13"))throw new Error('Selected map-pin close control must preserve an Android-safe touch target and stacking order.');
if(!screen.includes('hitSlop={12}'))throw new Error('Selected map-pin close control must preserve forgiving hit slop.');
if(screen.includes('Road trip / advanced')||screen.includes('showAdvanced ? ('))throw new Error('Detailed controls must stay in the dismissible filter modal.');

console.log('Consumer adaptive nearby and route-aware restroom discovery authority audit passed.');
