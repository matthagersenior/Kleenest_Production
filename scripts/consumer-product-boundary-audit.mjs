import fs from 'node:fs';
import path from 'node:path';

const failures=[];
const required=[
  'docs/CONSUMER_OPERATIONS_PRODUCT_BOUNDARY.md',
  'apps/consumer-mobile/app/_layout.tsx',
  'apps/consumer-mobile/app/index.tsx',
  'apps/consumer-mobile/app/explore.tsx',
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
 const explore=fs.readFileSync('apps/consumer-mobile/app/explore.tsx','utf8');
 const layout=fs.readFileSync('apps/consumer-mobile/app/_layout.tsx','utf8');
 const location=fs.readFileSync('apps/consumer-mobile/app/location/[id].tsx','utf8');
 const core=fs.readFileSync('packages/mobile-core/src/index.ts','utf8');
 for(const token of ["'/explore'",'Find a better bathroom','THE KLEENEST LOOP','Verified community','PLAY + PROGRESS','YOUR NETWORK'])if(!home.includes(token))failures.push(`Consumer Home missing rich bathroom-first/data-production behavior: ${token}`);
 for(const token of ['listNearbyRestrooms','listAmenityCatalog','selectedAmenityNames','What matters on this stop?','Start directions','captureConsumerDiscovery','captureConsumerRouteIntent','readNearbyCache','writeNearbyCache','listLocationTrustSummaries'])if(!explore.includes(token))failures.push(`Consumer discovery missing mature capability: ${token}`);
 if(!/pathname\s*:\s*['"]\/route['"]/.test(explore))failures.push('Consumer discovery missing mature capability: route navigation');
 for(const token of ['explore','play','social','profile'])if(!layout.includes(`name="${token}"`))failures.push(`Consumer primary navigation missing ${token}.`);
 for(const token of ['mobileCheckIn','createMobileReview'])if(!core.includes(token))failures.push(`Mobile core missing canonical consumer production authority: ${token}`);
 if(!location.includes('mobileCheckIn'))failures.push('Location details must expose canonical check-in behavior.');
}

if(failures.length){console.error('Consumer product boundary audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Consumer product boundary audit passed.');
