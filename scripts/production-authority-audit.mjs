import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const required=['index.html','src/main.jsx','src/runtime/App.jsx','src/runtime/ProfilePage.jsx','src/runtime/LocationPage.jsx','src/runtime/RoutePage.jsx','src/runtime/SavedPage.jsx','src/lib/supabase.js','src/services/nearby.js','src/services/locations.js','src/services/favorites.js','src/services/identity.js','src/services/account.js','src/styles.css'];
const failures=[];
for(const file of required) if(!fs.existsSync(path.join(root,file))) failures.push(`missing required production file: ${file}`);
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('src/runtime/App.jsx');
const route=read('src/runtime/RoutePage.jsx');
const location=read('src/runtime/LocationPage.jsx');
const saved=read('src/runtime/SavedPage.jsx');
const profile=read('src/runtime/ProfilePage.jsx');
const nearby=read('src/services/nearby.js');
const locations=read('src/services/locations.js');
const favorites=read('src/services/favorites.js');
const identity=read('src/services/identity.js');
const account=read('src/services/account.js');
const client=read('src/lib/supabase.js');
const contracts=[
  [app.includes('to="/nearby" replace'), 'compatibility discovery routes must redirect to the canonical Nearby surface'],
  [app.includes('LegacyPlaceRedirect'), 'legacy place route must parameterize its canonical redirect'],
  [app.includes("['/saved', 'Saved']"), 'Saved must be part of canonical consumer navigation'],
  [route.includes('Starting location + ordered stops'), 'route contract must use starting location plus ordered stops'],
  [!route.includes('Destination'), 'route UI must not introduce a Destination field'],
  [route.includes('getLocations'), 'route stops must hydrate through the canonical location service'],
  [nearby.includes("rpc('map_network_nearby_v1'"), 'Nearby must use canonical map_network_nearby_v1 authority'],
  [locations.includes("from('locations')"), 'location details must use the canonical locations dataset'],
  [favorites.includes("rpc('my_favorite_locations'"), 'Saved reads must use my_favorite_locations authority'],
  [favorites.includes("rpc('kleenest_toggle_favorite'"), 'Saved writes must use kleenest_toggle_favorite authority'],
  [saved.includes('listFavoriteLocations'), 'Saved surface must consume canonical favorites service'],
  [location.includes('toggleFavorite'), 'Location details must expose canonical favorite mutation'],
  [account.includes("rpc('user_subscription_summary'"), 'Profile membership must use user_subscription_summary authority'],
  [identity.includes('signInWithPassword')&&identity.includes('signInWithOtp'), 'identity service must expose password and magic-link authentication'],
  [profile.includes('getAccountSummary')&&profile.includes('identity.getSession'), 'Profile surface must consume canonical identity and membership services'],
  [client.includes('VITE_SUPABASE_PUBLISHABLE_KEY'), 'browser client must use the publishable-key environment contract'],
  [!client.toLowerCase().includes('service_role'), 'browser client must never reference a service-role credential'],
];
for(const [ok,message] of contracts) if(!ok) failures.push(message);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{const full=path.join(dir,entry.name);return entry.isDirectory()?walk(full):[full];});}
for(const file of walk(path.join(root,'src'))){const name=path.basename(file);if(/(Fixed|Stable|Production|V2|V3)\.(jsx?|tsx?)$/.test(name)) failures.push(`legacy/versioned runtime naming is forbidden: ${path.relative(root,file)}`);}
if(failures.length){console.error('Production authority audit failed:');for(const failure of failures) console.error(`- ${failure}`);process.exit(1);}console.log('Production authority audit passed.');
