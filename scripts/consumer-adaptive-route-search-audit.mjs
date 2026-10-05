import fs from 'node:fs';

const paths={
  screen:'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  route:'apps/consumer-mobile/app/route.tsx',
  entry:'apps/consumer-mobile/app/explore.tsx',
  signals:'apps/consumer-mobile/components/RestroomSignals.tsx',
  core:'packages/mobile-core/src/adaptiveDiscovery.ts',
  publicEntry:'packages/mobile-core/src/publicEntry.ts',
  cache:'apps/consumer-mobile/services/nearbyCache.ts',
  locationResolver:'apps/consumer-mobile/services/locationResolver.ts',
  locationResolverEdge:'supabase/functions/resolve-consumer-location/index.ts',
  migration:'supabase/migrations/20260906052000_consumer_adaptive_route_search.sql',
  densityMigration:'supabase/migrations/20260914165745_density_adaptive_discovery_ranking.sql',
  densityCompatMigration:'supabase/migrations/20260914170001_density_discovery_anon_compat.sql',
  densitySafeMigration:'supabase/migrations/20260914170218_density_discovery_safe_v3_projection.sql',
  routePermissionRepair:'supabase/migrations/20260923200727_route_search_sanitized_projection.sql',
  routeAllPlacesMigration:'supabase/migrations/20260923221800_route_all_discovered_places.sql',
  routeSpatialMigration:'supabase/migrations/20260924151211_route_corridor_private_projection.sql',
  fastNearbyMigration:'supabase/migrations/20260927034954_fast_complete_nearby_all_projection.sql',
  locationTrust:'apps/consumer-mobile/services/locationTrust.ts',
  locationPresentation:'apps/consumer-mobile/services/locationPresentation.ts',
  restroomFacilities:'apps/consumer-mobile/services/restroomFacilities.ts',
  betaButton:'apps/consumer-mobile/components/BetaReportButton.tsx',
  liveDiscoveryEdge:'supabase/functions/ingest-map-candidates-v3/index.ts',
};
for(const [label,path] of Object.entries(paths))if(!fs.existsSync(path))throw new Error(`${label} adaptive-search authority missing: ${path}`);
const read=path=>fs.readFileSync(path,'utf8');
const requireToken=(text,token,label)=>{if(!text.includes(token))throw new Error(`${label} missing ${token}`)};
const screen=read(paths.screen), entry=read(paths.entry), signals=read(paths.signals), core=read(paths.core), publicEntry=read(paths.publicEntry), cache=read(paths.cache), locationResolver=read(paths.locationResolver), locationResolverEdge=read(paths.locationResolverEdge), migration=read(paths.migration), densityMigration=read(paths.densityMigration), densityCompatMigration=read(paths.densityCompatMigration), densitySafeMigration=read(paths.densitySafeMigration), routePermissionRepair=read(paths.routePermissionRepair), routeAllPlacesMigration=read(paths.routeAllPlacesMigration), routeSpatialMigration=read(paths.routeSpatialMigration), fastNearbyMigration=read(paths.fastNearbyMigration), locationTrust=read(paths.locationTrust), locationPresentation=read(paths.locationPresentation), restroomFacilities=read(paths.restroomFacilities), betaButton=read(paths.betaButton), liveDiscoveryEdge=read(paths.liveDiscoveryEdge);

for(const token of ['1 mi','2 mi','5 mi','10 mi','25 mi','50 mi','100 mi','250 mi','Must include all','Include any','Search farther when needed','Search up to','Nearby','Along route','findAdaptiveNearbyRestrooms','listPlacesAlongRoute','buildMobileRoute','kleenest.native.route.draft','distance_to_route_meters','route_fraction','Full details','Add to route','Start navigation'])requireToken(screen,token,'Consumer adaptive Explore');
for(const token of ['AdaptiveExploreScreen'])requireToken(entry,token,'Consumer Explore entry');
for(const token of ['CompactRestroomSignals','RestroomSignals'])requireToken(signals,token,'Consumer restroom signal presentation');
for(const token of ['map_network_nearby_v3','map_network_along_route_v1','AmenityMatchRule','findAdaptiveNearbyRestrooms','listPlacesAlongRoute','listRestroomsAlongRoute','402336','DENSE_LOCAL_RESULT_COUNT','MODERATE_LOCAL_RESULT_COUNT','hardRadius','Math.min(500'])requireToken(core,token,'Mobile discovery core');
requireToken(publicEntry,"export * from './adaptiveDiscovery';",'Mobile public entry');
for(const token of [
  "functions.invoke('resolve-consumer-location'",
  'resolved?.latitude',
  'resolved?.longitude',
])requireToken(locationResolver,token,'Consumer location resolver client boundary');
for(const token of [
  "CENSUS_GEOCODER_URL",
  "Public_AR_Current",
  "addressMatches",
  "normalizeCensusCandidate",
  "lookupCensus",
  "looksLikeUsStreetAddress",
  "const providers = looksLikeUsStreetAddress(query)",
  "[lookupCensus, lookupPrimary, lookupPhoton]",
  "[lookupCensusPlace, lookupPrimary, lookupPhoton]",
])requireToken(locationResolverEdge,token,'Consumer residential geocoder priority');
if(locationResolverEdge.includes("fetch('https://maps.googleapis.com"))throw new Error('Consumer address geocoding must not depend on a client-shipped Google Maps key.');

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
if(!screen.includes('findAdaptiveNearbyPlaces')||!screen.includes('autoExpand: true'))throw new Error('Default all-place discovery must keep expanding when local supply is sparse.');
if(!screen.includes('findAdaptiveNearbyRestrooms')||!(screen.includes('hardRadius: !autoExpand')||screen.includes('hardRadius: !activeAutoExpand')))throw new Error('Zero-result hard radius behavior must be reserved for explicit amenity-constrained searches, including intent-aware radius constraints.');
if(!screen.includes('useState(402336)'))throw new Error('Adaptive discovery must retain the supported 250 mile fallback ceiling.');
for(const token of ['organizeDiscoveryRows','const freshness=','const kleenest=','const amenities=','distance_meters'])requireToken(screen,token,'Freshness → Kleenest → Amenities → distance ranking');
if(!screen.includes('RECOMMENDED'))throw new Error('Discovery must visually identify its recommended nearby result.');
if(!screen.includes('effectiveRadiusMeters')||!screen.includes('attemptedRadiiMeters'))throw new Error('Adaptive expansion provenance must remain available to the UI without requiring verbose density explainer copy.');
if(!screen.includes('route.distanceMiles')||!screen.includes('route.durationMinutes'))throw new Error('Along-route distance/ETA must derive from actual built-route totals.');
if(!routePermissionRepair.includes("public.map_network_nearby_v2("))throw new Error('Along-route discovery must consume the sanitized map projection instead of raw locations.');
if(routePermissionRepair.includes('FROM public.locations'))throw new Error('Along-route discovery must not read raw public.locations from the mobile caller context.');
for(const token of ['SECURITY INVOKER','REVOKE ALL ON FUNCTION','GRANT EXECUTE ON FUNCTION','distance_to_route_meters','route_fraction'])requireToken(routePermissionRepair,token,'Route permission repair');
for(const token of ["trim(p_category),''),'restroom'))='all'","p_limit > 250","greatest(30000","distance_to_route_meters","route_fraction"])requireToken(routeAllPlacesMigration,token,'All-place route discovery migration');
if(routeAllPlacesMigration.includes('FROM public.locations'))throw new Error('All-place route discovery must stay on the sanitized nearby projection.');
for(const token of ['CREATE SCHEMA IF NOT EXISTS kleenest_api_private','SECURITY DEFINER','ST_DWithin(l.geom,v_route_geog,p_corridor_m)','distance_to_route_meters','route_fraction','CREATE OR REPLACE FUNCTION public.map_network_along_route_v1','SECURITY INVOKER'])requireToken(routeSpatialMigration,token,'Indexed private route projection migration');
if(routeSpatialMigration.includes('sample_points')||routeSpatialMigration.includes('generate_series(0,v_sample_count)')||routeSpatialMigration.includes('map_network_nearby_v2('))throw new Error('Final route projection must use direct indexed corridor lookup instead of repeated giant-radius sampling.');
const routePublicWrapper=routeSpatialMigration.slice(routeSpatialMigration.lastIndexOf('CREATE OR REPLACE FUNCTION public.map_network_along_route_v1'));
if(routePublicWrapper.includes('SECURITY DEFINER'))throw new Error('Public route wrapper must remain SECURITY INVOKER.');
if(routePublicWrapper.includes('FROM public.locations'))throw new Error('Public route wrapper must not read raw locations directly.');
if(!routeSpatialMigration.includes("v_category='all'"))throw new Error('Indexed route projection must preserve all-discovered-place mode.');
if(!screen.includes("category: 'all'")||!screen.includes('limit: 200'))throw new Error('Along-route Explore must request the widened discovered-place projection.');
for(const token of [
  'function snapMapToDiscoveryOrigin(target:[number,number],openDestinationCard=false)',
  "setSelectedId('')",
  'setDestinationCardOpen(false)',
  'setMapCenter(target)',
  'setMapZoom(13)',
  'setCameraNonce((value)=>value+1)',
  'snapMapToDiscoveryOrigin(areaMatch.origin,true)',
  'const resetSelectionForOriginChange=Boolean(areaMatch)||clearQuery',
  "accessibilityLabel={mode==='route'?'Select destination marker':'Select searched destination marker'}",
])requireToken(screen,token,'Searched-address Explore origin parity');
if(!screen.includes("const query=areaMatch||overrideOrigin?'':rawQuery;"))throw new Error('Resolved address and dragged-map searches must discover the full nearby network instead of text-filtering results by stale address text.');
if(!screen.includes('result = await findAdaptiveNearbyPlaces({')&&!screen.includes('result = await withTimeout(findAdaptiveNearbyPlaces({'))throw new Error('Everything-mode address discovery must use the same adaptive all-place engine as app-open nearby discovery.');
for(const token of [
  'const cameraRef=useRef<any>(null);',
  'cameraRef.current?.jumpTo({center:target,zoom:13})',
  'const enrichmentRun=++nearbyEnrichmentRunRef.current;',
  'Trust, network, photos and progression are enhancements, not blockers.',
  'limit: 2000',
])requireToken(screen,token,'Immediate searched-location rendering');
if(!core.includes('export const MODERATE_LOCAL_RESULT_COUNT=25;'))throw new Error('Sparse suburban discovery must not stop at the old 8-result two-mile threshold.');
for(const token of ["rpc('map_network_nearby_all_v1'","Math.min(2000","Canonical discovery is the interactive path"])requireToken(core,token,'Fast complete all-place discovery');
const placesCore=core.slice(core.indexOf('export async function findAdaptiveNearbyPlaces'),core.indexOf('export type RouteDiscoveryCategory'));
if(placesCore.includes('const harvest=await harvestPromise'))throw new Error('Default all-place discovery must not block on live harvesting.');
for(const token of ['map_network_nearby_all_core_v1','ST_DWithin(l.geom,v_origin,p_radius_m)','p_limit > 2000','SECURITY DEFINER','CREATE OR REPLACE FUNCTION public.map_network_nearby_all_v1','SECURITY INVOKER'])requireToken(fastNearbyMigration,token,'Fast indexed nearby projection');
const nearbyPublicWrapper=fastNearbyMigration.slice(fastNearbyMigration.lastIndexOf('CREATE OR REPLACE FUNCTION public.map_network_nearby_all_v1'));
if(nearbyPublicWrapper.includes('SECURITY DEFINER'))throw new Error('Public fast nearby wrapper must remain SECURITY INVOKER.');
if(nearbyPublicWrapper.includes('FROM public.locations'))throw new Error('Public fast nearby wrapper must not expose raw locations.');
for(const [text,label,chunk] of [[locationTrust,'trust enrichment',100],[locationPresentation,'presentation enrichment',200],[restroomFacilities,'facility enrichment',200]]){
  if(!text.includes('for(let index=0;index<ids.length;index+=' + chunk))throw new Error(label+' must chunk the complete result set instead of truncating it.');
}
if(screen.includes('refreshControl={<RefreshControl'))throw new Error('Explore pull-to-refresh must stay disabled so map panning cannot trigger a page refresh gesture.');
for(const token of [
  'destinationCardOpen',
  'Select destination marker',
  'Start directions to searched destination',
  'Add searched destination to route',
  'destinationPanel',
])requireToken(screen,token,'Selectable compact destination marker/card');
if(screen.includes('Refresh discovery near destination')||screen.includes('>Refresh nearby</Text>'))throw new Error('Destination card must keep only the two primary decisions instead of stacking redundant refresh actions.');

for(const token of [
  'const SEARCH_DESTINATION_GEOFENCE_RADIUS_M=150;',
  'const searchedDestination=useMemo(',
  'geofence_radius_m:SEARCH_DESTINATION_GEOFENCE_RADIUS_M',
  'function snapMapToDiscoveryOrigin(target:[number,number],openDestinationCard=false)',
  'setDestinationCardOpen(openDestinationCard)',
  'snapMapToDiscoveryOrigin(areaMatch.origin,true)',
  'async function goToSearchDestination()',
  'function addSearchDestinationToRoute()',
  'onPress={()=>void goToSearchDestination()}',
  'onPress={addSearchDestinationToRoute}',
])requireToken(screen,token,'Resolved searched-address destination actions');
if(screen.includes("onPress={mode==='route'?selectDestinationMarker:recenterMap}"))throw new Error('Searched-address marker must open its destination card in both Nearby and Along route modes.');

for(const token of [
  "mode==='route'? \`Stops along route · ${radiusLabel(corridor)} corridor\`",
  'Longest stretch between qualifying bathrooms:',
  "from 'react-native-safe-area-context'",
])requireToken(screen,token,'Along-route map framing and compact result summary');
if(screen.includes('useSafeAreaInsets'))throw new Error('Explore must use the safe-area-context SafeAreaView boundary without inset-driven search padding.');
if(signals.includes('>＋</Text>'))throw new Error('Map legend control must not look like a second zoom-in button.');
for(const token of ['accessibilityLabel="Tell Kleenest what you think"','✦ Tell Kleenest'])requireToken(betaButton,token,'Labeled Tell Kleenest feedback control');
if(betaButton.includes("const compactFab=route==='/explore';"))throw new Error('Explore feedback control must stay labeled instead of collapsing to an unlabeled sparkle-only FAB.');
if(!screen.includes('setMapZoom((current) => Math.max(current, 14));'))throw new Error('Selecting a place from a grouped pin must preserve the detailed map zoom.');
for(const token of [
  'const DENSITY_CAMERA_FALLBACK_ZOOM=13;',
  'function densityAwareInitialZoom(rows:any[],origin:[number,number],fallback=DENSITY_CAMERA_FALLBACK_ZOOM)',
  'if(withinHalfMile>=80)return 16;',
  'if(withinHalfMile>=40||withinMile>=120)return 15.5;',
  'if(withinMile>=60)return 15;',
  'if(withinMile>=30)return 14.5;',
  'if(withinMile>=15)return 14;',
  'const densityZoom=densityAwareInitialZoom(cameraRows,target);',
])requireToken(screen,token,'Density-aware Explore camera framing');
for(const token of [
  'const cameraInteractionVersionRef=useRef(0);',
  'const cameraInteractionVersion=cameraInteractionVersionRef.current;',
  'function applyDensityAwareCamera(cameraRows:any[],target:[number,number])',
  'applyDensityAwareCamera(cachedRows,fallback.origin);',
  'applyDensityAwareCamera(displayRows,nextOrigin);',
  'if(cameraInteractionVersionRef.current===cameraInteractionVersion&&!preservedId)applyDensityAwareCamera(enriched,nextOrigin);',
])requireToken(screen,token,'Density-aware Explore camera execution across live, enriched, and cached results');
if(/key=\{`explore-camera-\$\{cameraNonce\}-\$\{selectedId\}-/.test(screen))throw new Error('Opening or closing a selected location must not remount the map camera.');
if(!/key=\{`explore-camera-\$\{cameraNonce\}-\$\{mode\}-/.test(screen))throw new Error('Explore map camera must remain keyed to intentional camera changes, not selected-card visibility.');

for(const token of [
  'function setMapGestureLock(locked:boolean)',
  'scrollEnabled={false}',
  'style={s.resultsSheetList}',
  'function beginMapGesture(){setMapGestureLock(true);}',
  'function endMapGesture()',
  'onStartShouldSetResponderCapture={()=>{beginMapGesture();return false}}',
  'onMoveShouldSetResponderCapture={()=>{beginMapGesture();return false}}',
  'onTouchStart={beginMapGesture}',
  'onTouchMove={beginMapGesture}',
  'onTouchEnd={endMapGesture}',
  'onTouchCancel={()=>setMapGestureLock(false)}',
])requireToken(screen,token,'Immediate native map gesture ownership');
for(const token of [
  '<FreshnessHeatRing item={row} size={22} />',
  'mapFlairBadge',
  "borderColor:equippedMapFlair==='gold-ring'?'#e7c45d':theme.accent",
  'style={[s.clusterMarker,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  '<FreshnessHeatRing item={selected} size={38} photoUrl=',
  '<FreshnessHeatRing item={item} size={34} photoUrl=',
])requireToken(screen,token,'Map freshness-ring semantics');
if(screen.includes("equippedMapFlair==='gold-ring'&&{borderWidth:3"))throw new Error('Equipped map flair must not replace or visually masquerade as the freshness heat ring.');
for(const token of [
  "borderStyle:heat.ageDays==null?'dashed':'solid'",
  "Cluster count · zoom in for each place's freshness",
  'Corner badge = equipped map flair, not freshness',
])requireToken(signals,token,'Freshness legend and unknown-state semantics');


// Explore is one continuous consumer page: compact search controls → map → results.
// Detailed qualification controls live in a dismissible filter menu so the map stays high.
for(const token of [
  'const [showAdvanced, setShowAdvanced] = useState(false);',
  'accessibilityLabel="Nearby search"',
  'accessibilityLabel="Along route search"',
  'accessibilityLabel="Filter places"',
  'Filter places',
  'Everything',
  'Kleenest partners',
  'Earn rewards',
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
  'accessibilityLabel="Fit full route on map"',
  'onDirections={() => void directions(item)}',
  'onAddToRoute={() => addToRoute(item)}',
  'function openLocationDetails(row:any)',
  'onDetails={() => openLocationDetails(item)}',
  'selectedRoutePosition',
  'RequestedAmenityMatches',
  'requestedAmenities={selectedAmenityNames}',
])requireToken(screen,token,'Consumer compact-filter Explore composition');

if(screen.includes('Scroll results · map stays fixed'))throw new Error('Consumer Explore must not describe or implement a fixed-map/separate-results scrolling model.');
if((screen.match(/<FlatList/g)||[]).length!==1)throw new Error('Consumer Explore must use exactly one primary virtualized vertical scroll surface.');

const modeIndex=screen.indexOf('accessibilityLabel="Nearby search"');
const filterButtonIndex=screen.indexOf('accessibilityLabel="Filter places"');
const mapIndex=screen.indexOf('<View style={s.mapSection}>');
const sheetIndex=screen.indexOf('s.resultsSheet,');
if(!(modeIndex>0&&filterButtonIndex>modeIndex&&mapIndex>filterButtonIndex&&sheetIndex>mapIndex))throw new Error('Consumer Explore must preserve floating controls → full-screen map → overlay results-sheet ordering.');
if(!screen.includes('scrollEnabled={false}'))throw new Error('The outer Explore list must stay fixed so map gestures do not fight page scrolling.');
if(!screen.includes('style={s.resultsSheetList}'))throw new Error('Search results must scroll inside the map-overlay results sheet.');

const filterModalStart=screen.indexOf('<Modal');
const filterModalEnd=screen.indexOf('</Modal>',filterModalStart);
const filterModal=screen.slice(filterModalStart,filterModalEnd);
for(const token of ['Starting radius','What matters on this stop?','Search farther when needed','Search up to','How far off route?','Must include all','Include any','Kleenest partners','Earn rewards','Stars','How recent?']){
  if(!filterModal.includes(token))throw new Error(`Consumer Explore must keep ${token} inside the filter modal disclosure.`);
}
if(!filterModal.includes('filterAmenities.map'))throw new Error('Amenity chips must move into the filter modal so the map rises on the page.');
if(!filterModal.includes('radiusChoices.map'))throw new Error('Radius controls must move into the filter modal so the map rises on the page.');
if(!screen.includes('pointerEvents="auto"')||!screen.includes('s.resultsSheet,'))throw new Error('Results sheet must own touch events above the native map.');
if(!screen.includes("resultsSheet:{position:'absolute',left:8,right:8,bottom:8"))throw new Error('Results sheet must stay bottom-anchored over the full-screen map.');
if(!screen.includes("sheetClose:{width:36,height:36"))throw new Error('Selected-place close control must remain visible inside the overlay sheet.');
if(!screen.includes('hitSlop={12}'))throw new Error('Selected-place close control must preserve forgiving hit slop.');
const selectedActionsIndex=screen.indexOf('style={s.selectedSheetActions}');
const selectedScrollIndex=screen.indexOf('<ScrollView style={s.selectedSheetScroll}');
if(!(selectedActionsIndex>0&&selectedScrollIndex>selectedActionsIndex))throw new Error('Go, Add to route, and Full details must remain fixed above the selected-place detail scroll.');
if(screen.includes('<RestroomSignals item={item} compact />'))throw new Error('Result cards must use compact icon/value signals instead of tall labeled signal pills.');
for(const token of [
  '<CompactRestroomSignals item={item} />',
  "sheetResultRow:{minHeight:76",
  "resultsSheet:{position:'absolute'",
  "selectedSheetActions:{flexDirection:'row',gap:6,position:'absolute'",
  "selectedSheetScroll:{flex:1,minHeight:0}",
  "primarySmall: { minHeight: 44",
  "secondarySmall: { minHeight: 44",
  "Why trusted?",
  "trustEvidenceLine(item)",
  "<DecisionRestroomSignals item={selected} />",
  "selectedMoreRow:{flexDirection:'row',gap:6}",
])requireToken(screen,token,'Consumer compact Explore sheet density and trust transparency');
if(screen.includes("{selected ? 'Selected on map' : 'Tap this card to focus its map pin'}"))throw new Error('Result cards must not spend vertical space on redundant map-selection hint copy.');
if(screen.includes('Road trip / advanced')||screen.includes('showAdvanced ? ('))throw new Error('Detailed controls must stay in the dismissible filter modal.');

console.log('Consumer adaptive nearby and route-aware discovered-place authority audit passed.');

// Consumer searches must expose live-discovered places in the same search session,
// while keeping canonical first-paint fast and teaching Kleenest about those places.
const liveRefreshFn=core.slice(core.indexOf('export async function refreshNearbyPlaceInventory'),core.indexOf("export type RouteDiscoveryCategory"));
for(const token of ['mergeDiscoveredPlaceRows','harvest?.locations','canonical_pending','discovered_unverified'])requireToken(core,token,'Live-discovered place merge and trust state');
for(const token of ['refreshNearbyPlaceInventory','Promise.all','listNearbyMapCandidates','harvestNearbyMapCandidates'])requireToken(liveRefreshFn,token,'Same-search live place refresh');
for(const token of ['refreshNearbyPlaceInventory({','Paint canonical results immediately','same search session'])requireToken(screen,token,'Progressive same-search live discovery');
for(const token of ['EdgeRuntime.waitUntil','persist(allLocations)','canonical_persistence: "background"'])requireToken(liveDiscoveryEdge,token,'Background canonicalization of discovered places');
