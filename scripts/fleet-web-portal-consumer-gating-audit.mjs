import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const requireTokens=(label,source,tokens)=>{for(const token of tokens)if(!source.includes(token))failures.push(label+' missing '+token)};

const migration=read('supabase/migrations/20260913112500_fleet_dispatcher_web_portal_authority.sql');
const fleetConfig=read('apps/fleet-mobile/app.config.ts');
const fleetPkg=read('apps/fleet-mobile/package.json');
const fleetMetro=read('apps/fleet-mobile/metro.config.js');
const fleetLayout=read('apps/fleet-mobile/app/_layout.tsx');
const fleetOnboardingService=read('apps/fleet-mobile/services/onboarding.ts');
const fleetOnboarding=read('apps/fleet-mobile/app/onboarding.tsx');
const members=read('apps/business-mobile/app/members.tsx');
const businessHome=read('apps/business-mobile/app/index.tsx');
const webExperience=read('apps/consumer-mobile/services/webExperience.ts');
const consumerHome=read('apps/consumer-mobile/app/index.tsx');
const install=read('apps/consumer-mobile/app/install.tsx');
const marketing=read('apps/consumer-mobile/components/MarketingSitePro.tsx');
const pages=read('.github/workflows/pages.yml');
const publisher=read('.github/workflows/publish-standalone-installer.yml');

requireTokens('Fleet dispatcher authority',migration,[
  "alter type public.business_member_role add value if not exists 'dispatcher'",
  "'owner','admin','manager','dispatcher'",
  'public.fleet_actor_is_manager(p_business_id)',
  'public.fleet_product_enabled(p_business_id)',
  'fleet_onboarding_gate',
  "'can_complete',public.business_admin_guard(p_business_id)"
]);
requireTokens('Fleet web config',fleetConfig,[
  "output:'single'",
  "bundler:'metro'",
  "baseUrl:'/Kleenest_Production/fleet'",
  "Kleenest Fleet Web"
]);
requireTokens('Fleet web package',fleetPkg,['"web:export":"expo export --platform web"']);
requireTokens('Fleet web compatibility',fleetMetro,[
  "platform==='web'",
  "'@maplibre/maplibre-react-native'",
  "'expo-secure-store'",
  "'expo-notifications'",
  "'expo-task-manager'"
]);
requireTokens('Fleet role gate',fleetLayout,[
  "workspaceRole==='operator'",
  "name=\"dispatch\"",
  "name=\"operations\"",
  "name=\"planner\"",
  "name=\"assets\""
]);
requireTokens('Fleet onboarding authority',fleetOnboardingService,["rpc('fleet_onboarding_gate'"]);
requireTokens('Fleet commercial copy',fleetOnboarding,['75 Premium users']);
requireTokens('Dispatcher team UI',members,[
  "'dispatcher'",
  'Invite dispatcher',
  "inviteBusinessMember(id,userId,'dispatcher')"
]);
requireTokens('Business-to-Fleet portal access',businessHome,[
  "window.location.assign('/Kleenest_Production/fleet/')",
  'Open Fleet portal',
  'fleet_enabled'
]);

requireTokens('Consumer web experience gate',webExperience,[
  "kleenest.consumer.app-presence.v1",
  'display-mode: standalone',
  'getInstalledRelatedApps',
  'getSession',
  'onAuthStateChange',
  'signedIn',
  'installed',
  'appActive'
]);
requireTokens('Consumer home install gate',consumerHome,[
  'useConsumerWebExperience',
  'showInstall',
  "!signedIn&&!installed",
  'showInstall?<Pressable'
]);
if(consumerHome.includes("{Platform.OS==='web'?<Pressable accessibilityRole=\"button\" accessibilityLabel=\"Install Kleenest\""))failures.push('Consumer Home still shows Install Kleenest to every web user.');
requireTokens('Install presence persistence',install,[
  'markConsumerAppPresence',
  'appinstalled',
  "choice.outcome==='accepted'"
]);
requireTokens('Marketing suppression',marketing,[
  'useConsumerWebExperience',
  'appActive',
  "router.replace('/?app=1'",
  'OPEN FLEET PORTAL',
  "/Kleenest_Production/fleet/"
]);
requireTokens('Fleet web validation',pages,[
  'apps/fleet-mobile/**',
  'npm run web:export --workspace @kleenest/fleet-mobile',
  'apps/fleet-mobile/dist/index.html',
  'apps/fleet-mobile/dist'
]);
requireTokens('Fleet web publishing',publisher,[
  'npm run web:export --workspace @kleenest/fleet-mobile',
  'apps/consumer-mobile/dist/fleet',
  'cp -R apps/fleet-mobile/dist/. apps/consumer-mobile/dist/fleet/',
  'fleet_routes=',
  'apps/consumer-mobile/dist/fleet/dispatch/index.html',
  'apps/consumer-mobile/dist/fleet/nearby/index.html',
  'apps/consumer-mobile/dist/fleet/operations/index.html'
]);

if(failures.length){
  console.error('Fleet web portal / Consumer gating audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Fleet web portal / Consumer gating audit passed: owners, admins, managers and dispatchers converge on the Fleet web control plane, while signed-in or app-present Consumer users bypass public marketing and install CTAs.');
