import fs from 'node:fs';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const compact=source=>source.replace(/\s+/g,'');
const mobileCore=read('packages/mobile-core/src/index.ts');
const mobileCoreCompact=compact(mobileCore);
if(!mobileCoreCompact.includes("flowType:'pkce'")&&!mobileCoreCompact.includes('flowType:"pkce"'))failures.push('Shared Supabase client must pin OAuth to PKCE so operator callbacks use deterministic code exchange.');
const consumerLayout=read('apps/consumer-mobile/app/_layout.tsx');
const relay=read('apps/consumer-mobile/services/operatorOAuthRelay.ts');
if(!consumerLayout.includes('relayOperatorOAuthCallback()')||!consumerLayout.includes('operatorOAuthRelaying'))failures.push('Deployed Consumer Expo root must relay operator OAuth callbacks before normal Consumer rendering.');
if(!relay.includes('kleenest.operator.oauth.return')||!relay.includes('createdAt')||!relay.includes('OPERATOR_OAUTH_MAX_AGE_MS')||!relay.includes("'/Kleenest_Production/'+portal+'/auth/'"))failures.push('Consumer-root OAuth relay must restore a fresh Business, Fleet, or Owner callback target.');
if(!relay.includes('getBrowserLocation')||!relay.includes("typeof location.search!=='string'")||!relay.includes('!location||!callbackPresent(location)'))failures.push('Consumer-root OAuth relay must exit safely on native runtimes where window exists without browser location APIs.');

const consumer=read('apps/consumer-mobile/app/profile.tsx');
const consumerCompact=compact(consumer);
if(!consumer.includes('Continue with Google'))failures.push('Consumer must expose a visible Continue with Google action.');
if(!consumerCompact.includes("provider:'google'")&&!consumerCompact.includes('provider:"google"'))failures.push('Consumer must authenticate with the canonical Supabase Google provider.');
if(!consumer.includes('signInWithOAuth'))failures.push('Consumer must initiate Google authentication through Supabase OAuth.');
if(!consumerCompact.includes("skipBrowserRedirect:Platform.OS!=='web'")&&!consumerCompact.includes('skipBrowserRedirect:Platform.OS!=="web"'))failures.push('Consumer OAuth must use browser-native redirect behavior on web and app-controlled browser navigation on native.');
if(!consumer.includes('mobileAuthRedirect')||!consumer.includes('Linking.openURL'))failures.push('Consumer Google OAuth must return through the Kleenest mobile deep link.');
if(!consumer.includes('exchangeCodeForSession'))failures.push('Consumer must exchange the OAuth callback code for a Supabase session.');
if(consumer.includes("Linking.createURL('/profile'")||consumer.includes('Linking.createURL("/profile"'))failures.push('Consumer OAuth callback must not use the broken triple-slashed profile deep link.');
if(!consumer.includes("Linking.createURL('profile'")&&!consumer.includes('Linking.createURL("profile"'))failures.push("Consumer native OAuth callback must use Linking.createURL('profile', ...).");
if(!consumer.includes('isTripleSlashed:false')&&!consumerCompact.includes('isTripleSlashed:false'))failures.push('Consumer native OAuth callback must preserve the non-triple-slashed callback contract.');
if(!consumer.includes('/Kleenest_Production/profile/'))failures.push('Consumer web OAuth must return to the materialized GitHub Pages profile callback.');
if(!consumer.includes("router.replace('/')")&&!consumer.includes('router.replace("/")'))failures.push('Consumer successful authentication must return to Home instead of leaving the user on Profile.');

const operatorAuth=[
  ['Owner','apps/platform-mobile/app/auth.tsx','kleenest-owner'],
  ['Business','apps/business-mobile/app/auth.tsx','kleenest-business'],
  ['Fleet','apps/fleet-mobile/app/auth.tsx','kleenest-fleet'],
];
for(const [label,path,scheme] of operatorAuth){
  const source=read(path);
  const sourceCompact=compact(source);
  if(!source.includes('Continue with Google'))failures.push(`${label} must expose a visible Continue with Google action.`);
  if(!sourceCompact.includes("provider:'google'")&&!sourceCompact.includes('provider:"google"'))failures.push(`${label} must authenticate with the canonical Supabase Google provider.`);
  if(!source.includes('signInWithOAuth')||!source.includes('skipBrowserRedirect'))failures.push(`${label} native OAuth must use Supabase OAuth with app-controlled browser navigation.`);
  if(!source.includes('exchangeCodeForSession')||!source.includes('Linking.openURL'))failures.push(`${label} must exchange the OAuth callback and return through its native deep link.`);
  if(!source.includes('access_token')||!source.includes('refresh_token')||!source.includes('setSession'))failures.push(`${label} must accept token callbacks as a compatibility fallback while PKCE rollout converges.`);
  if(!source.includes('kleenest.operator.oauth.return'))failures.push(`${label} web OAuth must remember which operator portal initiated Google sign-in.`);
  if(!source.includes('createdAt: Date.now()'))failures.push(`${label} operator OAuth return marker must expire instead of persisting indefinitely.`);
  if(!sourceCompact.includes("redirectTo:Platform.OS==='web'?webSiteOAuthRedirect:")&&!sourceCompact.includes('redirectTo:Platform.OS==="web"?webSiteOAuthRedirect:'))failures.push(`${label} web Google OAuth must return through the canonical site root relay rather than a nested portal callback.`);
  if(!source.includes(`scheme: '${scheme}'`)&&!sourceCompact.includes(`scheme:'${scheme}'`))failures.push(`${label} OAuth must use the ${scheme} native scheme.`);
  if(source.includes("Linking.createURL('/auth'")||source.includes('Linking.createURL("/auth"'))failures.push(`${label} OAuth callback must use the repaired native auth path without a leading slash.`);
  if(!source.includes("Linking.createURL('auth'")&&!source.includes('Linking.createURL("auth"'))failures.push(`${label} OAuth callback must use Linking.createURL('auth', ...).`);
}

const owner=read('apps/platform-mobile/app/auth.tsx');
if(!owner.includes('isTripleSlashed: false'))failures.push('Owner OAuth callback must preserve the verified non-triple-slashed KleenestOS callback contract.');

const businessLayoutCompact=compact(read('apps/business-mobile/app/_layout.tsx'));
const fleetLayoutCompact=compact(read('apps/fleet-mobile/app/_layout.tsx'));
const ownerLayoutCompact=compact(read('apps/platform-mobile/app/_layout.tsx'));
if(!businessLayoutCompact.includes('if(onAuthRoute)return;'))failures.push('Business layout must let the auth screen finish OAuth/access routing before workspace guards redirect.');
if(!fleetLayoutCompact.includes('if(onAuthRoute)return;'))failures.push('Fleet layout must let the auth screen finish OAuth/access routing before workspace guards redirect.');
if(ownerLayoutCompact.includes("signedIn&&onAuthRoute)router.replace('/')"))failures.push('Owner layout must not redirect away from the auth callback before Owner authority verification finishes.');

if(failures.length){
  console.error('Native Google auth audit failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Native Google auth audit passed for Consumer, Owner, Business and Fleet.');
