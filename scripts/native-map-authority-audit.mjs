import fs from 'node:fs';

const required=['apps/consumer-mobile/package.json','apps/consumer-mobile/app.config.ts','apps/consumer-mobile/app/explore.tsx','apps/consumer-mobile/app/route.tsx'];
const failures=[];
for(const file of required) if(!fs.existsSync(file)) failures.push(`missing native map authority file: ${file}`);
if(!failures.length){
  const pkg=fs.readFileSync(required[0],'utf8');
  const config=fs.readFileSync(required[1],'utf8');
  const explore=fs.readFileSync(required[2],'utf8');
  const route=fs.readFileSync(required[3],'utf8');
  if(!pkg.includes('@maplibre/maplibre-react-native')) failures.push('Native consumer app must depend on MapLibre React Native.');
  if(!config.includes("'@maplibre/maplibre-react-native'")) failures.push('Expo config must register the MapLibre native config plugin.');
  if(!explore.includes("import { Camera, Map, Marker }")||!explore.includes('<Map ')||!explore.includes('<Camera')) failures.push('Explore must render the canonical MapLibre v11 Map surface.');
  if(!explore.includes("tile.openstreetmap.org")||!explore.includes("type:'raster'")) failures.push('Native MapLibre must use the canonical OpenStreetMap raster style family.');
  if(!explore.includes('<Marker')||explore.includes('cluster')) failures.push('Restroom markers must remain individually actionable and unclustered.');
  if(!explore.includes('height:320')) failures.push('Native Explore map must keep a non-zero fixed layout height to avoid zero-size iOS MapLibre mounts.');
  if(!explore.includes('google.com/maps/dir')||!explore.includes("pathname:'/route'")) failures.push('Map discovery must preserve direct navigation and canonical route handoff.');
  if(!route.includes("GeoJSONSource")||!route.includes("type=\"line\"")||!route.includes('stopCoordinates')) failures.push('Native Route must render canonical route geometry and ordered stop markers in MapLibre.');
  if(!route.includes('setBuilt(null)')||!route.includes('if(hydrated.current)setBuilt(null)')) failures.push('Changing ordered stops must invalidate a stale built route preview.');
  if(!route.includes('height:300')) failures.push('Native Route map must keep a non-zero fixed layout height.');
  if(/react-native-maps|leaflet/i.test(explore+route+pkg)) failures.push('Native consumer runtime must not introduce a competing map engine.');
}
if(failures.length){console.error('Native map authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native map authority audit passed.');
