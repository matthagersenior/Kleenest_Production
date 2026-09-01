import fs from 'node:fs';

const required=['apps/consumer-mobile/package.json','apps/consumer-mobile/app.config.ts','apps/consumer-mobile/app/explore.tsx','apps/consumer-mobile/app/route.tsx','packages/mobile-core/src/index.ts'];
const failures=[];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing native map authority file: ${file}`);
if(!failures.length){
 const pkg=fs.readFileSync(required[0],'utf8'),config=fs.readFileSync(required[1],'utf8'),explore=fs.readFileSync(required[2],'utf8'),route=fs.readFileSync(required[3],'utf8'),core=fs.readFileSync(required[4],'utf8');
 if(!pkg.includes('@maplibre/maplibre-react-native'))failures.push('Native consumer app must depend on MapLibre React Native.');
 if(!config.includes("'@maplibre/maplibre-react-native'"))failures.push('Expo config must register the MapLibre native config plugin.');
 for(const token of ['Find your best nearby bathroom.','Locate','Search a place, address or brand','What matters on this stop?','Start directions','Add to route','BEST NEXT DECISION'])if(!explore.includes(token))failures.push(`Bathroom-first rich Explore missing ${token}.`);
 if(!explore.includes("import { Camera, Map, Marker }")||!explore.includes('<Map ')||!explore.includes('<Camera'))failures.push('Explore must render MapLibre.');
 if(!explore.includes('tile.openstreetmap.org')||!explore.includes("type:'raster'"))failures.push('Explore must use canonical OpenStreetMap raster tiles.');
 if(!explore.includes('<Marker')||/\bcluster\s*=/.test(explore))failures.push('Nearby restroom markers must stay directly actionable and unclustered.');
 const mapHeight=explore.match(/mapFrame:\{height:(\d+)/);if(!mapHeight||Number(mapHeight[1])<280)failures.push('Explore map requires a stable substantial native height.');
 if(!explore.includes('google.com/maps/dir')||!explore.includes("pathname:'/route'"))failures.push('Discovery must preserve direct directions and route-planner handoff.');
 if(!core.includes("p_category:'restroom'"))failures.push('Canonical nearby discovery must be restroom-scoped.');
 if(core.includes("p_category:null,p_search"))failures.push('Consumer restroom discovery must not become unrestricted category discovery.');
 if(!core.includes('amenityNames:string[]=[]')||!core.includes('p_amenity_names:names.length?names:null'))failures.push('Mobile discovery must carry amenity names to canonical nearby authority.');
 if(!explore.includes('listAmenityCatalog')||!explore.includes('selectedAmenityNames'))failures.push('Explore must consume canonical amenity filters.');
 if(!explore.includes('listNearbyRestrooms(current.coords.latitude,current.coords.longitude,radius,query,selectedAmenityNames)'))failures.push('Explore must use the single nearby-restroom service with radius/search/amenity inputs.');
 if(!explore.includes('canUseGenericCache=!search.trim()&&!selectedAmenityNames.length'))failures.push('Unfiltered cached results must never masquerade as filtered live results.');
 if(!explore.includes('listLocationTrustSummaries')||!explore.includes('captureConsumerDiscovery')||!explore.includes('captureConsumerRouteIntent'))failures.push('Rich Explore must preserve batched trust context and lightweight backend data production.');
 if(!route.includes('GeoJSONSource')||!route.includes('type="line"')||!route.includes('stopCoordinates'))failures.push('Route must render canonical geometry and ordered stops.');
 const stateInvalidation=route.includes('setBuilt(null)')&&route.includes('[stopIds,hydrated]')&&route.includes('if(!hydrated)return;');
 if(!stateInvalidation)failures.push('Changing route stops must invalidate stale route output after route draft hydration.');
 if(!route.includes('height:300'))failures.push('Route map must keep a stable native height.');
 if(/react-native-maps|leaflet/i.test(explore+route+pkg))failures.push('Consumer mobile must not introduce a competing map engine.');
}
if(failures.length){console.error('Native map authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native map authority audit passed.');
