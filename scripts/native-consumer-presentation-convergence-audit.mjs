import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const requireAll=(path,tokens)=>{const source=read(path);for(const token of tokens){if(!source.includes(token))throw new Error(`${path} missing presentation contract: ${token}`)}return source};

const ui=requireAll('apps/consumer-mobile/components/ConsumerUI.tsx',['HeroCard','FeatureCard','SectionHeader','TrustStrip','MetricTile','palette']);
const layout=requireAll('apps/consumer-mobile/app/_layout.tsx',["title:'Home'","title:'Explore'","title:'Progress'","title:'Community'","title:'Profile'","name=\"play\"","name=\"discover\"","name=\"preferences\"",'tabBarActiveTintColor','const tabLabel=','adjustsFontSizeToFit',"tabBarLabel:tabLabel('Community')"]);
const launch=requireAll('apps/consumer-mobile/app/index.tsx',['Redirect','/explore','MarketingHome','useConsumerWebExperience']);
const home=requireAll('apps/consumer-mobile/app/home.tsx',['RelevanceHeroCarousel','QUICK ACTIONS','OPEN KLEENEST AI','OPEN COMMUNITY','MarketingHome','useConsumerWebExperience']);
const heroRelevance=requireAll('apps/consumer-mobile/services/heroRelevance.ts',['review_ready','active_mission','fresh_kleenest','saved_choice','top_ranked','next_objective','find_bathroom','share_knowledge','scan_qr',"route:'/explore'","route:'/discover'","route:'/progress'","route:'/qr'"]);
const explorePath='apps/consumer-mobile/app/explore.tsx';
const adaptiveExplorePath='apps/consumer-mobile/features/AdaptiveExploreScreen.tsx';
const explore=`${read(explorePath)}\n${read(adaptiveExplorePath)}`;
for(const token of ['Search this area','Results ↓','resultsHandoff','BEST NEXT DECISION','What matters on this stop?','Start navigation','resolveConsumerSearchLocation','searchAreaOrigin','Searching near','Address, school, workplace, city or brand','listLocationTrustSummaries','listNearbyRestrooms',"router.push('/discover')"])if(!explore.includes(token))throw new Error(`Canonical Explore presentation missing contract: ${token}`);
const discover=requireAll('apps/consumer-mobile/app/discover.tsx',['matchOrCreateDiscovery','recordDiscoveryEvidence','uploadDiscoveryPhoto','onsite_live']);
const progress=requireAll('apps/consumer-mobile/app/progress.tsx',['SPECIALTY LEVELS','Quests','Missions','Challenges','Journeys','Campaigns','Contests','BADGES','RANKINGS']);
const profile=requireAll('apps/consumer-mobile/app/profile.tsx',['Your restroom network','Your progress and people','Control your Kleenest','Privacy & preferences','Scan a Kleenest code','Contribution-backed standing','update_my_public_profile']);
const prefs=requireAll('apps/consumer-mobile/app/preferences.tsx',['Privacy & preferences','profile_visibility','show_activity','show_checkins','show_reviews','allow_followers','discoverable','preferred_units','home_region','get_my_profile_preferences','update_my_profile_preferences']);
const play=requireAll('apps/consumer-mobile/app/play.tsx',['PLAY','GAME CENTER','Game Center + progression.','ACTIVE TRUST MISSION','Active quests','Available quests','Challenges','Contests','Community leaderboard','12 game modes','Quests + badges','GAME_DEFINITIONS',"router.push('/games')"]);
const social=requireAll('apps/consumer-mobile/app/social.tsx',['COMMUNITY','People helping people find better bathrooms.','GROW YOUR NETWORK','Following','Followers','COMMUNITY PULSE','VISIT EVIDENCE','Contributor reputation']);
const location=requireAll('apps/consumer-mobile/app/location/[id].tsx',['KLEENEST RESTROOM','TrustStrip','BEFORE YOU GO','Start directions','Verify my visit','LocationAmenityInventory','createMobileReview','uploadReviewPhotos','completeTrustMission',"import ReviewReportAction from '../../components/ReviewReportAction';",'<ReviewReportAction reviewId={String(item.id)}']);
const saved=requireAll('apps/consumer-mobile/app/saved.tsx',['Your trusted bathroom shortlist.','Shape your shortlist','BEST EVIDENCED SAVED STOP','ACTIVE TRUST MISSION','TRUST MISSION','Directions','Add to route','listMobileFavoriteLocations']);
const route=requireAll('apps/consumer-mobile/app/route.tsx',['Plan the bathroom stops that matter.','Starting location + ordered stops','My Location','STOP ORDER','Build route','Start navigation','Move best first','buildMobileRoute','persistMobileRoute']);
const activitySource=read('apps/consumer-mobile/app/activity.tsx');
for(const token of ['See how the network gets stronger.','Your Kleenest history','Your trusted network','VISIT EVIDENCE','View strengthened restroom','listMyActivity','listMobileCommunityActivity'])if(!activitySource.includes(token))throw new Error(`apps/consumer-mobile/app/activity.tsx missing presentation contract: ${token}`);
const notifications=requireAll('apps/consumer-mobile/app/notifications.tsx',['What needs your attention.','Recent Kleenest updates','What reaches you','Enable push','Mark all read','listNotificationInbox','notificationDestination']);
const membership=requireAll('apps/consumer-mobile/app/membership.tsx',['Choose the membership that fits you.','Every Consumer capability included','Authoritative entitlement','Kleenest AI','offline trips','native store purchase boundary','Find a bathroom','getMobileAccountSummary','listMobilePricingCatalog']);
const qr=requireAll('apps/consumer-mobile/app/qr.tsx',['QR is optional proof, not the only check-in.','Choose the proof path that is actually available.','Check in with GPS + geofence','MANUAL FALLBACK','GPS check-in works without QR','CameraView','resolveQrAction','executeQrAction']);

for(const [name,source] of Object.entries({layout,launch,home,heroRelevance,explore,discover,progress,profile,prefs,play,social,location,saved,route,activity:activitySource,notifications,membership,qr,ui})){
  if(/\.rpc\(['"](?:business|fleet|enterprise|admin)_/i.test(source)||/from ['"][^'"]*(?:Business|Fleet|Enterprise|Admin)/.test(source))throw new Error(`${name} presentation surface leaked Operations authority into consumer UI`);
}
if(!heroRelevance.includes("route:'/explore'")||!heroRelevance.includes("route:'/discover'")||!heroRelevance.includes("route:'/progress'"))throw new Error('Organic Home relevance must keep Explore, Discover and Progress available as primary consumer actions');
if(!explore.includes('organizeDiscoveryRows')||!explore.includes('SponsoredSlot surface="maps"'))throw new Error('Explore functional home must preserve relevance ordering and separate sponsored inventory');
if(!profile.includes("router.push('/preferences')")&&!profile.includes('route="/preferences"'))throw new Error('Profile must expose privacy/preferences from the consumer hub');
if(!explore.includes('captureConsumerDiscovery')||!explore.includes('captureConsumerRouteIntent'))throw new Error('Rich discovery must preserve lightweight backend data production');
if(!discover.includes('matchOrCreateDiscovery')||!discover.includes('recordDiscoveryEvidence'))throw new Error('Discover must remain backed by canonical discovery/evidence authority');
if(!progress.includes('SPECIALTY LEVELS')||!progress.includes('Missions')||!progress.includes('Journeys'))throw new Error('Progress must expose the expanded canonical progression hierarchy');
if(!play.includes('getMobileProgressionDashboard')||!play.includes('listMobileActiveQuests')||!play.includes('GAME_DEFINITIONS'))throw new Error('Hidden legacy Play compatibility must remain backed by authoritative progression data and Game Center');
if(!social.includes('listMobileCommunityActivity')||!social.includes('toggleMobileFollow'))throw new Error('Rich Community presentation must preserve canonical community authority');
if(!location.includes('mobileCheckIn')||!location.includes('recordReviewAmenityInventory'))throw new Error('Rich Location presentation must preserve verified contribution authority');
if(!location.includes("import ReviewReportAction from '../../components/ReviewReportAction';")||!location.includes('<ReviewReportAction reviewId={String(item.id)}'))throw new Error('Location review cards must expose the canonical review reporting component');
if(!saved.includes('applyTrustDiscoveryControls')||!route.includes('function move(index:number,delta:number)'))throw new Error('Rich personal navigation surfaces must preserve explicit user-controlled trust ordering');
if(!notifications.includes('updateNotificationPreferences')||!(membership.includes('native store purchase boundary')||membership.includes('App Store / Google Play billing')))throw new Error('Rich account surfaces must preserve notification and native commerce boundaries');

const visibleTabs=new Set(['home','explore','progress','social','profile']);
const topLevelRoutes=fs.readdirSync('apps/consumer-mobile/app',{withFileTypes:true})
  .filter(entry=>entry.isFile()&&entry.name.endsWith('.tsx')&&entry.name!=='_layout.tsx')
  .map(entry=>entry.name.replace(/\.tsx$/,''));
for(const routeName of topLevelRoutes){
  const screenToken=`<Tabs.Screen name="${routeName}"`;
  if(!layout.includes(screenToken))throw new Error(`Consumer route ${routeName} must be explicitly declared in Tabs to prevent accidental tab exposure`);
  if(!visibleTabs.has(routeName)){
    const routeStart=layout.indexOf(screenToken);
    const routeEnd=layout.indexOf('/>',routeStart);
    const declaration=layout.slice(routeStart,routeEnd+2);
    if(!declaration.includes('href:null'))throw new Error(`Consumer route ${routeName} must remain hidden from the primary bottom tab bar`);
  }
}
if(topLevelRoutes.filter(routeName=>visibleTabs.has(routeName)).length!==visibleTabs.size)throw new Error('Consumer bottom navigation must expose Home, Explore, Progress, Community and Profile; the root launch route remains hidden and redirects to Explore');

console.log('Native consumer presentation convergence audit passed.');
