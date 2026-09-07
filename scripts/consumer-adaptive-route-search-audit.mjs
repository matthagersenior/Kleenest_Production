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

for(const token of ['1 mi','2 mi','5 mi','10 mi','25 mi','50 mi','100 mi','250 mi','Must include all','Include any','Expand for required amenities','Maximum distance','Nearby','Along route','findAdaptiveNearbyRestrooms','listRestroomsAlongRoute','buildMobileRoute','kleenest.native.route.draft','distance_to_route_meters','route_fraction','Full details','Add to route'])requireToken(screen,token,'Consumer adaptive Explore');
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
if(!screen.includes('selectedAmenityNames.length > 0 && autoExpand'))throw new Error('Automatic radius expansion must be limited to searches with required amenities.');
if(!screen.includes('useState(402336)'))throw new Error('Required-amenity expansion must default to the supported 250 mile ceiling.');
if(!screen.includes('effectiveRadiusMeters')||!screen.includes('attemptedRadiiMeters'))throw new Error('Adaptive expansion provenance is not surfaced to the UI.');
if(!screen.includes('route.distanceMiles')||!screen.includes('route.durationMinutes'))throw new Error('Along-route distance/ETA must derive from actual built-route totals.');

// The mature Explore composition is the default contract. Adaptive route / long-range controls are progressive disclosure,
// not a replacement screen that pushes the fixed map and result list below configuration chrome.
for(const token of [
  'const [showAdvanced, setShowAdvanced] = useState(false);',
  'Road trip / advanced',
  'Advanced trip controls',
  'setShowAdvanced((current) => !current)',
  'showAdvanced ? (',
  'MapLegend',
  'Close selected location',
  'Start directions →',
])requireToken(screen,token,'Consumer mature Explore composition');
const advancedStart=screen.indexOf('showAdvanced ? (');
for(const token of ['<View style={s.segment}>','Expand for required amenities','Maximum distance','Route corridor','Must include all','Include any']){
  const index=screen.indexOf(token);
  if(index<advancedStart)throw new Error(`Consumer mature Explore must keep ${token} behind advanced disclosure.`);
}
const radiusIndex=screen.indexOf('radiusChoices.map');
const amenityIndex=screen.indexOf('filterAmenities.map');
const mapIndex=screen.indexOf('<View style={s.mapSection}>');
if(!(radiusIndex>0&&amenityIndex>radiusIndex&&mapIndex>amenityIndex))throw new Error('Consumer mature Explore must preserve radius → amenities → fixed map ordering.');

console.log('Consumer adaptive nearby and route-aware restroom discovery authority audit passed.');
