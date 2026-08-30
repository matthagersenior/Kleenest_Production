import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html',
  'src/main.jsx',
  'src/runtime/App.jsx',
  'src/runtime/ProfilePage.jsx',
  'src/lib/supabase.js',
  'src/services/nearby.js',
  'src/services/identity.js',
  'src/services/account.js',
  'src/styles.css',
];

const failures = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`missing required production file: ${file}`);
}

const app = fs.readFileSync(path.join(root, 'src/runtime/App.jsx'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'src/runtime/ProfilePage.jsx'), 'utf8');
const nearby = fs.readFileSync(path.join(root, 'src/services/nearby.js'), 'utf8');
const identity = fs.readFileSync(path.join(root, 'src/services/identity.js'), 'utf8');
const account = fs.readFileSync(path.join(root, 'src/services/account.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src/lib/supabase.js'), 'utf8');

const contracts = [
  [app.includes('<Navigate to="/nearby" replace />'), 'compatibility discovery routes must redirect to the canonical Nearby surface'],
  [app.includes('Starting location + ordered stops'), 'route contract must use starting location plus ordered stops'],
  [!app.includes('Destination'), 'route UI must not introduce a Destination field'],
  [nearby.includes("rpc('map_network_nearby_v1'"), 'Nearby must use canonical map_network_nearby_v1 authority'],
  [account.includes("rpc('user_subscription_summary'"), 'Profile membership must use user_subscription_summary authority'],
  [identity.includes('signInWithPassword') && identity.includes('signInWithOtp'), 'identity service must expose password and magic-link authentication'],
  [profile.includes('getAccountSummary') && profile.includes('identity.getSession'), 'Profile surface must consume canonical identity and membership services'],
  [client.includes('VITE_SUPABASE_PUBLISHABLE_KEY'), 'browser client must use the publishable-key environment contract'],
  [!client.toLowerCase().includes('service_role'), 'browser client must never reference a service-role credential'],
];
for (const [ok, message] of contracts) if (!ok) failures.push(message);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

for (const file of walk(path.join(root, 'src'))) {
  const name = path.basename(file);
  if (/(Fixed|Stable|Production|V2|V3)\.(jsx?|tsx?)$/.test(name)) {
    failures.push(`legacy/versioned runtime naming is forbidden: ${path.relative(root, file)}`);
  }
}

if (failures.length) {
  console.error('Production authority audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production authority audit passed.');
