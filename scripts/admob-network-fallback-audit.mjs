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
  'apps/consumer-mobile/app/home.tsx',
  'apps/consumer-mobile/app/profile.tsx',
  'supabase/migrations/20260920205000_business_self_service_sponsorship_and_network_ad_boundary.sql',
  'supabase/migrations/20260930012000_owner_admob_placement_control.sql',
  'supabase/migrations/20260930102000_web_network_ads_policy.sql',
  'apps/platform-mobile/services/ownerAdmin.ts',
  'apps/platform-mobile/app/relevance.tsx',
];
for(const file of required)if(!fs.existsSync(file))failures.push(`Missing AdMob/network boundary surface: ${file}`);

if(!failures.length){
  const pkg=read(required[0]),config=read(required[1]),service=read(required[2]),native=read(required[3]),web=read(required[4]),sponsored=read(required[5]),explore=read(required[6]),progress=read(required[7]),games=read(required[8]),home=read(required[9]),profile=read(required[10]),sql=read(required[11]),controlSql=read(required[12]),webControlSql=read(required[13]),owner=read(required[14]),ownerScreen=read(required[15]);
  if(!pkg.includes('"react-native-google-mobile-ads": "16.3.4"'))failures.push('Consumer must pin the Kotlin-compatible Google Mobile Ads bridge.');
  for(const token of ['react-native-google-mobile-ads','ADMOB_ANDROID_APP_ID','ADMOB_IOS_APP_ID','ca-app-pub-6958734306376288~2901875327','ca-app-pub-6958734306376288~3275164438'])if(!config.includes(token))failures.push(`AdMob Expo config missing: ${token}`);
  if(!native.includes('ca-app-pub-6958734306376288/6751375017'))failures.push('Android Native Advanced production ad unit is not configured.');
  if(!native.includes('ca-app-pub-6958734306376288/2327160255'))failures.push('iOS Native Advanced production ad unit is not configured.');
  if(!service.includes("rpc('consumer_network_ads_enabled'"))failures.push('Network ads must honor the dedicated removable-network-ad entitlement RPC.');
  if(!service.includes("rpc('consumer_network_ad_placement_enabled'"))failures.push('Network ads must honor Owner placement policy before requesting Google inventory.');
  for(const token of ['AdsConsent.gatherConsent','canRequestAds','NativeAd.createForAdRequest','TestIds.NATIVE','requestNonPersonalizedAdsOnly:true','AD · GOOGLE','consumerNetworkAdPlacementEnabled','$5 one-time'])if(!native.includes(token))failures.push(`Native AdMob card missing contract: ${token}`);
  for(const token of ['EXPO_PUBLIC_ADSENSE_CLIENT_ID','EXPO_PUBLIC_ADSENSE_WEB_DISPLAY_SLOT','pagead2.googlesyndication.com','adsbygoogle','consumerNetworkAdPlacementEnabled','AD · GOOGLE WEB'])if(!web.includes(token))failures.push(`Consumer Web AdSense surface missing: ${token}`);
  if(!service.includes("Platform.OS==='web'"))failures.push('Network-ad placement policy must support the web platform.');
  if(/fallback\??:|fallback=|ReactNode/.test(sponsored))failures.push('Kleenest Sponsored must own dedicated inventory and may not accept a network-ad fallback.');
  for(const source of [explore,progress,games])if(source.includes('fallback={<AdMobNativeSlot'))failures.push('AdMob and Kleenest Sponsored inventory must never share a fallback slot.');
  for(const [source,sponsoredToken,networkToken] of [
    [explore,'<SponsoredSlot surface="maps"','contextClass="maps_network_after_results_4"'],
    [progress,'<SponsoredSlot surface="progress"','contextClass="progress_network_after_trust"'],
    [games,'<SponsoredSlot surface="games"','contextClass="game_center_network_after_first_group"'],
    [home,'contextClass="home_feed_sponsored_after_updates_2"','contextClass="home_feed_network_after_updates_4"'],
  ]) {
    if(!source.includes(sponsoredToken))failures.push(`Missing dedicated Kleenest Sponsored placement: ${sponsoredToken}`);
    if(!source.includes(networkToken))failures.push(`Missing independent AdMob placement: ${networkToken}`);
  }
  if(!home.includes('contextClass="home_feed_network_after_updates_12"'))failures.push('Long Home feeds must expose a second independent AdMob placement after update 12.');
  if(!explore.includes('contextClass="maps_network_after_results_14"'))failures.push('Long Explore result sessions must expose a second independent AdMob placement after result 14.');
  if(!profile.includes('contextClass="profile_network_before_account"'))failures.push('Profile must expose one independent lower-page AdMob placement.');
  if(profile.includes('fallback={<AdMobNativeSlot'))failures.push('Profile AdMob may not compete with Kleenest Sponsored inventory.');
  if(!sql.includes("'premium_removes_sponsored',false")||!sql.includes("'remove_ads_scope','network_only'"))failures.push('Remove Ads must remain network-only.');
  const sponsoredFn=sql.slice(sql.indexOf('create or replace function public.consumer_sponsored_cards'),sql.indexOf('create or replace function public.business_sponsorship_snapshot'));
  if(sponsoredFn.includes('has_kleenest_premium')||sponsoredFn.includes('consumer_network_ads_enabled'))failures.push('Direct Kleenest sponsorship must not consult the network-ad removal entitlement.');
  for(const token of ['create table if not exists public.network_ad_placements','consumer_network_ad_placement_enabled','owner_network_ad_placement_snapshot','owner_update_network_ad_placement','maps_network_after_results_14','home_feed_network_after_updates_4','profile_network_before_account'])if(!controlSql.includes(token))failures.push(`Owner AdMob placement control migration missing: ${token}`);
  for(const token of ['web_enabled',"('android','ios','web')",'owner_update_network_ad_placement_v2'])if(!webControlSql.includes(token))failures.push(`Web network-ad policy migration missing: ${token}`);
  for(const token of ['getOwnerNetworkAdPlacements','updateOwnerNetworkAdPlacement'])if(!owner.includes(token))failures.push(`Owner AdMob service missing: ${token}`);
  for(const token of ['Google Network Ad Controls','Network placements','label="Web"','updateOwnerNetworkAdPlacement'])if(!ownerScreen.includes(token))failures.push(`KleenestOS Google network-ad control surface missing: ${token}`);
  const hero=read('apps/consumer-mobile/components/RelevanceHeroCarousel.tsx');
  if(/AdMobNativeSlot|react-native-google-mobile-ads/i.test(hero))failures.push('Google ads may not render inside the organic hero carousel.');
}
if(failures.length){console.error('AdMob network fallback audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Google network-ad boundary audit passed for native AdMob, Consumer Web AdSense, owner controls, and separate Kleenest Sponsored inventory.');
