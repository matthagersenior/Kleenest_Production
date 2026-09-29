import fs from 'node:fs';

const failures=[];
const read=file=>fs.readFileSync(file,'utf8');
const required=[
  'apps/consumer-mobile/package.json',
  'apps/consumer-mobile/app.config.ts',
  'apps/consumer-mobile/services/networkAds.ts',
  'apps/consumer-mobile/components/AdMobNativeSlot.native.tsx',
  'apps/consumer-mobile/components/AdMobNativeSlot.tsx',
  'apps/consumer-mobile/components/SponsoredSlot.tsx',
  'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  'apps/consumer-mobile/app/progress.tsx',
  'apps/consumer-mobile/app/games.tsx',
  'supabase/migrations/20260920205000_business_self_service_sponsorship_and_network_ad_boundary.sql',
];
for(const file of required)if(!fs.existsSync(file))failures.push(`Missing AdMob/network boundary surface: ${file}`);

if(!failures.length){
  const pkg=read(required[0]),config=read(required[1]),service=read(required[2]),native=read(required[3]),web=read(required[4]),sponsored=read(required[5]),explore=read(required[6]),progress=read(required[7]),games=read(required[8]),sql=read(required[9]);
  if(!pkg.includes('"react-native-google-mobile-ads": "16.3.4"'))failures.push('Consumer must pin the Kotlin-compatible Google Mobile Ads bridge.');
  for(const token of ['react-native-google-mobile-ads','ADMOB_ANDROID_APP_ID','ADMOB_IOS_APP_ID','ca-app-pub-6958734306376288~2901875327','ca-app-pub-6958734306376288~3275164438'])if(!config.includes(token))failures.push(`AdMob Expo config missing: ${token}`);
  if(!native.includes('ca-app-pub-6958734306376288/6751375017'))failures.push('Android Native Advanced production ad unit is not configured.');
  if(!native.includes('ca-app-pub-6958734306376288/2327160255'))failures.push('iOS Native Advanced production ad unit is not configured.');
  if(!service.includes("rpc('consumer_network_ads_enabled'"))failures.push('Network ads must honor the dedicated removable-network-ad entitlement RPC.');
  for(const token of ['AdsConsent.gatherConsent','canRequestAds','NativeAd.createForAdRequest','TestIds.NATIVE','requestNonPersonalizedAdsOnly:true','AD · GOOGLE','Remove Ads hides network ads'])if(!native.includes(token))failures.push(`Native AdMob card missing contract: ${token}`);
  if(!web.includes('return null'))failures.push('Web must remain safe when the native AdMob module is unavailable.');
  if(/fallback\??:|fallback=|ReactNode/.test(sponsored))failures.push('Kleenest Sponsored must own dedicated inventory and may not accept a network-ad fallback.');
  for(const source of [explore,progress,games])if(source.includes('fallback={<AdMobNativeSlot'))failures.push('AdMob and Kleenest Sponsored inventory must never share a fallback slot.');
  for(const [source,sponsoredToken,networkToken] of [
    [explore,'<SponsoredSlot surface="maps"','contextClass="maps_network_after_results_4"'],
    [progress,'<SponsoredSlot surface="progress"','contextClass="progress_network_after_trust"'],
    [games,'<SponsoredSlot surface="games"','contextClass="game_center_network_after_first_group"'],
  ]) {
    if(!source.includes(sponsoredToken))failures.push(`Missing dedicated Kleenest Sponsored placement: ${sponsoredToken}`);
    if(!source.includes(networkToken))failures.push(`Missing independent AdMob placement: ${networkToken}`);
  }
  if(!sql.includes("'premium_removes_sponsored',false")||!sql.includes("'remove_ads_scope','network_only'"))failures.push('Remove Ads must remain network-only.');
  const sponsoredFn=sql.slice(sql.indexOf('create or replace function public.consumer_sponsored_cards'),sql.indexOf('create or replace function public.business_sponsorship_snapshot'));
  if(sponsoredFn.includes('has_kleenest_premium')||sponsoredFn.includes('consumer_network_ads_enabled'))failures.push('Direct Kleenest sponsorship must not consult the network-ad removal entitlement.');
  const hero=read('apps/consumer-mobile/components/RelevanceHeroCarousel.tsx');
  if(/AdMobNativeSlot|react-native-google-mobile-ads/i.test(hero))failures.push('Google ads may not render inside the organic hero carousel.');
}
if(failures.length){console.error('AdMob network fallback audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('AdMob network fallback audit passed.');
