import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const requireAll=(path,tokens)=>{const source=read(path);for(const token of tokens){if(!source.includes(token))throw new Error(`${path} missing presentation contract: ${token}`)}return source};

const ui=requireAll('apps/consumer-mobile/components/ConsumerUI.tsx',['HeroCard','FeatureCard','SectionHeader','TrustStrip','MetricTile','palette']);
const layout=requireAll('apps/consumer-mobile/app/_layout.tsx',["title:'Home'","title:'Explore'","title:'Progress'","title:'Community'","title:'Profile'","name=\"play\"","name=\"discover\"","name=\"preferences\"",'tabBarActiveTintColor']);
const home=requireAll('apps/consumer-mobile/app/index.tsx',['Find a better bathroom. Discover what the map is missing.','THE KLEENEST LOOP','YOUR NETWORK','XP + levels','Add a missing place','Membership','Game Center','Support']);
const explore=requireAll('apps/consumer-mobile/app/explore.tsx',['Find a trusted bathroom.','BEST NEXT DECISION','What matters on this stop?','Start directions →','listLocationTrustSummaries','listNearbyRestrooms',"router.push('/discover')"]);
const discover=requireAll('apps/consumer-mobile/app/discover.tsx',['matchOrCreateDiscovery','recordDiscoveryEvidence','uploadDiscoveryPhoto','onsite_live']);
const progress=requireAll('apps/consumer-mobile/app/progress.tsx',['SPECIALTY LEVELS','Quests','Missions','Challenges','Journeys','Campaigns','Contests','BADGES','RANKINGS']);
const profile=requireAll('apps/consumer-mobile/app/profile.tsx',['Your restroom network','Your progress and people','Control your Kleenest','Privacy & preferences','Scan a Kleenest code','Contribution-backed standing','update_my_public_profile']);
const prefs=requireAll('apps/consumer-mobile/app/preferences.tsx',['Privacy & preferences','profile_visibility','show_activity','show_checkins','show_reviews','allow_followers','discoverable','preferred_units','home_region','get_my_profile_preferences','update_my_profile_preferences']);
const play=requireAll('apps/consumer-mobile/app/play.tsx',['PLAY','GAME CENTER','Game Center + progression.','ACTIVE TRUST MISSION','Active quests','Available quests','Challenges','Contests','Community leaderboard','12 game modes','Quests + badges','GAME_DEFINITIONS',"router.push('/games')"]);
const social=requireAll('apps/consumer-mobile/app/social.tsx',['COMMUNITY','People helping people find better bathrooms.','GROW YOUR NETWORK','Following','Followers','COMMUNITY PULSE','VISIT EVIDENCE','Contributor reputation']);
const location=requireAll('apps/consumer-mobile/app/location/[id].tsx',['KLEENEST RESTROOM','TrustStrip','BEFORE YOU GO','Start directions','Verify my visit','LocationAmenityInventory','createMobileReview','uploadReviewPhotos','completeTrustMission','reportReview','Report review']);
const saved=requireAll('apps/consumer-mobile/app/saved.tsx',['Your trusted bathroom shortlist.','Shape your shortlist','BEST EVIDENCED SAVED STOP','ACTIVE TRUST MISSION','TRUST MISSION','Directions','Add to route','listMobileFavoriteLocations']);
const route=requireAll('apps/consumer-mobile/app/route.tsx',['Plan the bathroom stops that matter.','Starting location + ordered stops','My Location','STOP ORDER','Build route','Start navigation','Move best first','buildMobileRoute','persistMobileRoute']);
const activitySource=read('apps/consumer-mobile/app/activity.tsx');
for(const token of ['See how the network gets stronger.','Your Kleenest history','Your trusted network','VISIT EVIDENCE','View strengthened restroom','listMyActivity','listMobileCommunityActivity'])if(!activitySource.includes(token))throw new Error(`apps/consumer-mobile/app/activity.tsx missing presentation contract: ${token}`);
const notifications=requireAll('apps/consumer-mobile/app/notifications.tsx',['What needs your attention.','Recent Kleenest updates','What reaches you','Enable push','Mark all read','listNotificationInbox','notificationDestination']);
const membership=requireAll('apps/consumer-mobile/app/membership.tsx',['Choose the membership that fits you.','Every Consumer capability included','Authoritative entitlement','Kleenest AI','offline trips','native store purchase boundary','Find a bathroom','getMobileAccountSummary','listMobilePricingCatalog']);
const qr=requireAll('apps/consumer-mobile/app/qr.tsx',['Scan trust into the network.','Point, scan, continue','MANUAL FALLBACK','One canonical resolver','CameraView','resolveQrAction','executeQrAction']);

for(const [name,source] of Object.entries({layout,home,explore,discover,progress,profile,prefs,play,social,location,saved,route,activity:activitySource,notifications,membership,qr,ui})){
  if(/\.rpc\(['"](?:business|fleet|enterprise|admin)_/i.test(source)||/from ['"][^'"]*(?:Business|Fleet|Enterprise|Admin)/.test(source))throw new Error(`${name} presentation surface leaked Operations authority into consumer UI`);
}
if(!home.includes("'/explore'")||!home.includes("'/discover'")||!home.includes("'/progress'"))throw new Error('Home must keep Explore, Discover and Progress as primary consumer actions');
if(!profile.includes("router.push('/preferences')")&&!profile.includes('route="/preferences"'))throw new Error('Profile must expose privacy/preferences from the consumer hub');
if(!explore.includes('captureConsumerDiscovery')||!explore.includes('captureConsumerRouteIntent'))throw new Error('Rich discovery must preserve lightweight backend data production');
if(!discover.includes('matchOrCreateDiscovery')||!discover.includes('recordDiscoveryEvidence'))throw new Error('Discover must remain backed by canonical discovery/evidence authority');
if(!progress.includes('SPECIALTY LEVELS')||!progress.includes('Missions')||!progress.includes('Journeys'))throw new Error('Progress must expose the expanded canonical progression hierarchy');
if(!play.includes('getMobileProgressionDashboard')||!play.includes('listMobileActiveQuests')||!play.includes('GAME_DEFINITIONS'))throw new Error('Hidden legacy Play compatibility must remain backed by authoritative progression data and Game Center');
if(!social.includes('listMobileCommunityActivity')||!social.includes('toggleMobileFollow'))throw new Error('Rich Community presentation must preserve canonical community authority');
if(!location.includes('mobileCheckIn')||!location.includes('recordReviewAmenityInventory'))throw new Error('Rich Location presentation must preserve verified contribution authority');
if(!location.includes("reportReview(reviewId")||!location.includes('Report review'))throw new Error('Location review cards must expose the canonical review reporting authority');
if(!saved.includes('applyTrustDiscoveryControls')||!route.includes('function move(index:number,delta:number)'))throw new Error('Rich personal navigation surfaces must preserve explicit user-controlled trust ordering');
if(!notifications.includes('updateNotificationPreferences')||!(membership.includes('native store purchase boundary')||membership.includes('App Store / Google Play billing')))throw new Error('Rich account surfaces must preserve notification and native commerce boundaries');

console.log('Native consumer presentation convergence audit passed.');
