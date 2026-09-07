import fs from 'node:fs';

const failures=[];
const servicePath='apps/consumer-mobile/services/offline.ts';
const screenPath='apps/consumer-mobile/app/offline.tsx';
for(const file of [servicePath,screenPath])if(!fs.existsSync(file))failures.push(`missing offline corridor file: ${file}`);

if(!failures.length){
  const service=fs.readFileSync(servicePath,'utf8');
  const screen=fs.readFileSync(screenPath,'utf8');

  for(const token of [
    "@react-native-async-storage/async-storage",
    "kleenest.native.offline.route-packs.v1",
    'readLocalOfflinePacks',
    'writeLocalOfflinePack',
    "from('offline_pack_locations')",
    'snapshot',
    'AsyncStorage.setItem'
  ])if(!service.includes(token))failures.push(`offline service missing ${token}`);

  const snapshotsCanonicalRows=/from\('offline_pack_locations'\)[\s\S]*?select\([^)]*snapshot[^)]*\)/.test(service);
  if(!snapshotsCanonicalRows)failures.push('Offline preparation must read canonical offline_pack_locations.snapshot rows after pack creation.');

  const persistsAfterPackValidation=service.indexOf('writeLocalOfflinePack')>service.indexOf("from('offline_pack_locations')");
  if(!persistsAfterPackValidation)failures.push('Device-local persistence must occur only after canonical packed rows are loaded.');

  for(const token of ['readLocalOfflinePacks','saved on this device','locations.length'])if(!screen.includes(token))failures.push(`Offline screen missing ${token}`);
  if(!/try[\s\S]*?readLocalOfflinePacks[\s\S]*?listSavedRoutePlans/.test(screen))failures.push('Offline screen must hydrate device-local packs before attempting live route/pack reads.');
  if(!screen.includes('Offline mode')||!screen.includes('snapshot.name')||!screen.includes('snapshot.address'))failures.push('Offline screen must render useful local restroom snapshot details when live reads fail.');

  if(/service_role|SUPABASE_SERVICE/.test(service+screen))failures.push('Consumer offline continuity must not introduce privileged credentials or service-role authority.');
}

if(failures.length){
  console.error('Native consumer offline corridor audit failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Native consumer offline corridor audit passed.');
