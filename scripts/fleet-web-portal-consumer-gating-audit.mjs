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
const fleetPush=read('apps/fleet-mobile/services/push.ts');
const fleetWebNotifications=read('apps/fleet-mobile/web/notificationsPreview.ts');
const members=read('apps/business-mobile/app/members.tsx');
const businessHome=read('apps/business-mobile/app/index.tsx');
const businessFleet=read('apps/business-mobile/app/fleet.tsx');
const businessAuth=read('apps/business-mobile/app/auth.tsx');
const fleetAuth=read('apps/fleet-mobile/app/auth.tsx');
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
  "name=\"assets\"",
  "name=\"notifications\" options={{title:'Alerts'}}",
  "name=\"account\" options={{title:'Account'}}"
]);
if(fleetLayout.includes("href:operator?null:undefined,title:'Alerts'"))failures.push('Fleet operator Alerts are still hidden by the tab gate.');
requireTokens('Fleet onboarding authority',fleetOnboardingService,["rpc('fleet_onboarding_gate'"]);
requireTokens('Fleet web push registration',fleetPush,['PushManager','register_notification_push_subscription','registered-web','serviceWorker.register']);
requireTokens('Fleet web notification permission',fleetWebNotifications,['window.Notification.permission','window.Notification.requestPermission']);
requireTokens('Fleet commercial copy',fleetOnboarding,['75 Premium users']);
requireTokens('Dispatcher team UI',members,[
  "'dispatcher'",
  'Invite dispatcher',
  "inviteBusinessMember(id,userId,'dispatcher')"
]);
requireTokens('Business-to-Fleet suite access',businessHome,[
  "href:'/fleet'",
  'Fleet Suite',
  'fleet_enabled'
]);
requireTokens('Business-integrated Fleet suite',businessFleet,[
  'fleet_current_user_workspace_manifest',
  'operatorRoutes',
  'Fleet operator control plane',
  'Fleet client/member experience',
  '/Kleenest_Production/fleet/',
  'kleenest-fleet://'
]);
requireTokens('Business web OAuth callback',businessAuth,[
  '/Kleenest_Production/business/auth/',
  "skipBrowserRedirect: Platform.OS!=='web'",
  'window.location.assign(data.url)'
]);
requireTokens('Fleet web OAuth callback',fleetAuth,[
  '/Kleenest_Production/fleet/auth/',
  "skipBrowserRedirect: Platform.OS!=='web'",
  'window.location.assign(data.url)'
]);

requireTokens('Consumer web experience gate',webExperience,[
  "kleenest.consumer.installed-presence.v2",
  "kleenest.consumer.app-presence.v1",
  'display-mode: standalone',
  'getInstalledRelatedApps',
  'getSession',
  'onAuthStateChange',
  'signedIn',
  'installed',
  'explicitLaunch',
  'APP_SESSION_KEY',
  'sessionStorage',
  'appSession',
  'markConsumerAppSession',
  "if(standalone)markConsumerAppPresence()",
  'appActive:native||appSession||signedIn||installed'
]);
if(webExperience.includes('if(explicit||standalone)markConsumerAppPresence()')||webExperience.includes('if(explicitLaunch||standalone)markConsumerAppPresence()'))failures.push('Guest web launch is still persisted as installed app presence.');
if(webExperience.includes('const present=explicit||')||webExperience.includes('const present=explicitLaunch||'))failures.push('Explicit guest launch is still counted as an installed app.');
if(webExperience.includes('setInstalled(explicit||')||webExperience.includes('setInstalled(explicitLaunch||'))failures.push('Explicit guest launch still contaminates installed state.');
requireTokens('Consumer app entry install suppression',consumerHome,[
  'useConsumerWebExperience',
  'appActive',
  'Redirect',
  '/explore'
]);
if(consumerHome.includes("'/install'")||consumerHome.includes('Install Kleenest'))failures.push('Installed/signed-in Consumer app entry must not render an install CTA before Explore.');
requireTokens('Install presence persistence',install,[
  'markConsumerAppPresence',
  'appinstalled',
  "choice.outcome==='accepted'"
]);
requireTokens('Consumer no-install fallback',install,[
  'CONTINUE AS GUEST',
  'JOIN KLEENEST',
  'SIGN IN',
  "router.push('/?app=1'",
  "router.push('/signup'",
  "router.push('/profile'"
]);
requireTokens('Marketing suppression',marketing,[
  'useConsumerWebExperience',
  'usePathname',
  'appActive',
  "const autoOpenApp=pathname==='/'&&appActive",
  "router.replace('/?app=1'",
  'OPEN FLEET PORTAL',
  "/Kleenest_Production/fleet/"
]);
if(marketing.includes("ready&&appActive)router.replace('/?app=1'"))failures.push('Marketing subpages are still hijacked by the Consumer app-active redirect.');
requireTokens('Public website no-install entry',marketing,[
  'Continue as guest',
  'Join Kleenest',
  'Sign in to Kleenest',
  "go('/?app=1')",
  "go('/signup')",
  "go('/profile')"
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
  'apps/consumer-mobile/dist/fleet/operations/index.html',
  'apps/consumer-mobile/dist/business/fleet/index.html'
]);

if(failures.length){
  console.error('Fleet web portal / Consumer gating audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Fleet web portal / Consumer gating audit passed: owners, admins, managers and dispatchers converge on the Fleet web control plane, while signed-in or app-present Consumer users bypass public marketing and install CTAs.');
