import fs from 'node:fs';

const paths={
  screen:'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  route:'apps/consumer-mobile/app/route.tsx',
  entry:'apps/consumer-mobile/app/explore.tsx',
  core:'packages/mobile-core/src/adaptiveDiscovery.ts',
  publicEntry:'packages/mobile-core/src/publicEntry.ts',
  migration:'supabase/migrations/20260906052000_consumer_adaptive_route_search.sql',
};
for(const [label,path] of Object.entries(paths))if(!fs.existsSync(path))throw new Error(`${label} adaptive-search authority missing: ${path}`);
const read=path=>fs.readFileSync(path,'utf8');
const requireToken=(text,token,label)=>{if(!text.includes(token))throw new Error(`${label} missing ${token}`)};
const screen=read(paths.screen), entry=read(paths.entry), core=read(paths.core), publicEntry=read(paths.publicEntry), migration=read(paths.migration);

for(const token of ['1 mi','5 mi','10 mi','25 mi','50 mi','100 mi','250 mi','Must include all','Include any','Expand automatically','Maximum distance','Nearby','Along route','findAdaptiveNearbyRestrooms','listRestroomsAlongRoute','buildMobileRoute','kleenest.native.route.draft','distance_to_route_meters','route_fraction','Full details','Add to route'])requireToken(screen,token,'Consumer adaptive Explore');
for(const token of ['AdaptiveExploreScreen'])requireToken(entry,token,'Consumer Explore entry');
for(const token of ['map_network_nearby_v3','map_network_along_route_v1','AmenityMatchRule','findAdaptiveNearbyRestrooms','listRestroomsAlongRoute','402336','targetCount'])requireToken(core,token,'Mobile discovery core');
requireToken(publicEntry,"export * from './adaptiveDiscovery';",'Mobile public entry');
for(const token of ['map_network_nearby_v3','map_network_along_route_v1','p_amenity_match','SECURITY INVOKER','REVOKE ALL ON FUNCTION','GRANT EXECUTE ON FUNCTION','anon, authenticated','402336','40234','jsonb_array_length','ST_DWithin','route_fraction','distance_to_route_meters'])requireToken(migration,token,'Adaptive discovery migration');
if(migration.includes('SECURITY DEFINER'))throw new Error('Adaptive discovery RPCs must not use SECURITY DEFINER.');
if(/execute\s+format|\bEXECUTE\s+[^;]*\|\|/i.test(migration))throw new Error('Adaptive discovery migration must not use dynamic SQL.');
// JSX legitimately uses a `placeholder` prop for input hint text. Reject unfinished implementation markers,
// not framework vocabulary that happens to contain the same word.
if(/TODO|coming soon|not implemented|placeholder\s+(?:implementation|behavior|logic|code|handler)/i.test(screen+core+migration))throw new Error('Adaptive discovery cannot ship placeholder/TODO behavior.');
if(!screen.includes("matchRule === 'all'")||!screen.includes('selectedAmenityNames.length'))throw new Error('Amenity all/any controls are not wired to selected amenities.');
if(!screen.includes('effectiveRadiusMeters')||!screen.includes('attemptedRadiiMeters'))throw new Error('Adaptive expansion provenance is not surfaced to the UI.');
if(!screen.includes('route.distanceMiles')||!screen.includes('route.durationMinutes'))throw new Error('Along-route distance/ETA must derive from actual built-route totals.');
console.log('Consumer adaptive nearby and route-aware restroom discovery authority audit passed.');
