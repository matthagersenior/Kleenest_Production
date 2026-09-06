import fs from 'node:fs';
import path from 'node:path';

const failures=[];
const required=[
  'docs/CONSUMER_OPERATIONS_PRODUCT_BOUNDARY.md',
  'apps/consumer-mobile/app/_layout.tsx',
  'apps/consumer-mobile/app/index.tsx',
  'apps/consumer-mobile/app/explore.tsx',
  'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  'apps/consumer-mobile/app/discover.tsx',
  'apps/consumer-mobile/app/progress.tsx',
  'apps/consumer-mobile/app/location/[id].tsx',
  'apps/consumer-mobile/app/route.tsx',
  'apps/consumer-mobile/app/saved.tsx',
  'apps/consumer-mobile/app/play.tsx',
  'apps/consumer-mobile/app/games.tsx',
  'apps/consumer-mobile/app/social.tsx',
  'apps/consumer-mobile/app/activity.tsx',
  'apps/consumer-mobile/app/notifications.tsx',
  'apps/consumer-mobile/app/profile.tsx',
  'apps/consumer-mobile/app/preferences.tsx',
  'apps/consumer-mobile/app/qr.tsx',
  'apps/consumer-mobile/app/membership.tsx',
  'apps/consumer-mobile/services/discoveryProgression.ts',
  'packages/mobile-core/src/adaptiveDiscovery.ts',
  'packages/mobile-core/src/index.ts'
];
for(const file of required)if(!fs.existsSync(file))failures.push(`Missing consumer parity surface: ${file}`);

function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const target=path.join(dir,entry.name);return entry.isDirectory()?walk(target):[target]})}
const consumerFiles=[...walk('apps/consumer-mobile'),...walk('packages/mobile-core')].filter(file=>/\.(ts|tsx|js|jsx)$/.test(file));
for(const file of consumerFiles){const text=fs.readFileSync(file,'utf8');
  for(const pattern of [/\.rpc\(['"]business_/g,/\.rpc\(['"]fleet_/g,/\.rpc\(['"]enterprise_/g,/\.rpc\(['"]admin_/g]){
    if(pattern.test(text))failures.push(`Consumer client calls an operations RPC directly: ${file}`);
  }
  if(/from ['"][^'"]*src\/runtime\//.test(text)||/from ['"][^'"]*src\/services\/workspaces/.test(text))failures.push(`Consumer client imports Operations web runtime/service code: ${file}`);
}

if(!failures.length){
 const home=fs.readFileSync('apps/consumer-mobile/app/index.tsx','utf8');
 const exploreEntry=fs.readFileSync('apps/consumer-mobile/app/explore.tsx','utf8');
 const explore=fs.readFileSync('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx','utf8');
 const discover=fs.readFileSync('apps/consumer-mobile/app/discover.tsx','utf8');
 const progress=fs.readFileSync('apps/consumer-mobile/app/progress.tsx','utf8');
 const progressionService=fs.readFileSync('apps/consumer-mobile/services/discoveryProgression.ts','utf8');
 const layout=fs.readFileSync('apps/consumer-mobile/app/_layout.tsx','utf8');
 const location=fs.readFileSync('apps/consumer-mobile/app/location/[id].tsx','utf8');
 const core=fs.readFileSync('packages/mobile-core/src/index.ts','utf8');
 for(const token of ["'/explore'",'Find a better bathroom','THE KLEENEST LOOP','Community discovery','XP + levels','YOUR NETWORK','Add a missing place'])if(!home.includes(token))failures.push(`Consumer Home missing discovery/progression behavior: ${token}`);
 if(!exploreEntry.includes('AdaptiveExploreScreen'))failures.push('Consumer Explore route must delegate to the canonical adaptive discovery screen.');
 for(const token of ['findAdaptiveNearbyRestrooms','listRestroomsAlongRoute','listAmenityCatalog','selectedAmenityNames','Must include all','Include any','Expand automatically','Maximum distance','Along route','Full details','Directions','Add to route','captureConsumerDiscovery','captureConsumerRouteIntent','readNearbyCache','writeNearbyCache','listLocationTrustSummaries'])if(!explore.includes(token))failures.push(`Consumer discovery missing mature capability: ${token}`);
 if(!/pathname\s*:\s*['"]\/route['"]/.test(explore))failures.push('Consumer discovery missing mature capability: route navigation');
 for(const token of ['Remote','Address','Map pin','GPS','On-site live','Save / match discovery','Save restroom evidence','Take photo'])if(!discover.includes(token))failures.push(`Consumer contribution flow missing: ${token}`);
 for(const token of ['SPECIALTY LEVELS','WHAT TO DO NEXT','Quests','Missions','Challenges','Journeys','Campaigns','Contests','BADGES','RANKINGS','XP HISTORY'])if(!progress.includes(token))failures.push(`Consumer Progress missing expansive progression surface: ${token}`);
 for(const token of ['consumer_match_or_create_discovery','consumer_record_discovery_evidence','consumer_progression_overview','consumer_active_objectives','consumer_progression_rankings','consumer_nearby_progression_opportunities','attach_discovery_photo'])if(!progressionService.includes(token))failures.push(`Consumer discovery/progression service missing canonical RPC: ${token}`);
 for(const token of ['explore','progress','social','profile'])if(!layout.includes(`name="${token}"`))failures.push(`Consumer primary navigation missing ${token}.`);
 if(!layout.includes('name="discover"')||!layout.includes('href:null'))failures.push('Consumer Discover route must exist without creating a sixth primary tab.');
 for(const token of ['mobileCheckIn','createMobileReview'])if(!core.includes(token))failures.push(`Mobile core missing canonical consumer production authority: ${token}`);
 if(!location.includes('mobileCheckIn'))failures.push('Location details must expose canonical check-in behavior.');
}

if(failures.length){console.error('Consumer product boundary audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Consumer product boundary audit passed.');
