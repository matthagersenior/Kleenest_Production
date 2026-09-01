import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));
const expect=(condition,message)=>{if(!condition)failures.push(message)};

const required=[
 'package.json',
 'packages/mobile-core/package.json',
 'packages/mobile-core/src/index.ts',
 'packages/mobile-core/src/publicEntry.ts',
 'packages/mobile-core/src/privateActivity.ts',
 'apps/consumer-mobile/package.json',
 'apps/consumer-mobile/app.config.ts',
 'apps/consumer-mobile/eas.json',
 'apps/consumer-mobile/app/_layout.tsx',
 'apps/consumer-mobile/app/index.tsx',
 'apps/consumer-mobile/app/explore.tsx',
 'apps/consumer-mobile/app/play.tsx',
 'apps/consumer-mobile/app/route.tsx',
 'apps/consumer-mobile/app/profile.tsx',
 'apps/consumer-mobile/app/preferences.tsx',
 'apps/consumer-mobile/app/location/[id].tsx',
 'apps/consumer-mobile/app/saved.tsx',
 'apps/consumer-mobile/app/activity.tsx',
 'apps/consumer-mobile/services/activity.ts',
 'apps/consumer-mobile/app/notifications.tsx',
 'apps/consumer-mobile/services/notificationInbox.ts',
 'apps/consumer-mobile/app/social.tsx',
 'apps/consumer-mobile/app/membership.tsx'
];

for(const file of required)if(!exists(file))failures.push(`missing native authority file: ${file}`);

if(!failures.length){
 const pkg=read('package.json');
 const corePkg=read('packages/mobile-core/package.json');
 const core=read('packages/mobile-core/src/index.ts');
 const publicEntry=read('packages/mobile-core/src/publicEntry.ts');
 const privateActivity=read('packages/mobile-core/src/privateActivity.ts');
 const appPkg=read('apps/consumer-mobile/package.json');
 const appConfig=read('apps/consumer-mobile/app.config.ts');
 const layout=read('apps/consumer-mobile/app/_layout.tsx');
 const home=read('apps/consumer-mobile/app/index.tsx');
 const explore=read('apps/consumer-mobile/app/explore.tsx');
 const play=read('apps/consumer-mobile/app/play.tsx');
 const route=read('apps/consumer-mobile/app/route.tsx');
 const profile=read('apps/consumer-mobile/app/profile.tsx');
 const preferences=read('apps/consumer-mobile/app/preferences.tsx');
 const location=read('apps/consumer-mobile/app/location/[id].tsx');
 const saved=read('apps/consumer-mobile/app/saved.tsx');
 const activity=read('apps/consumer-mobile/app/activity.tsx');
 const activityService=read('apps/consumer-mobile/services/activity.ts');
 const notifications=read('apps/consumer-mobile/app/notifications.tsx');
 const notificationInbox=read('apps/consumer-mobile/services/notificationInbox.ts');
 const social=read('apps/consumer-mobile/app/social.tsx');
 const membership=read('apps/consumer-mobile/app/membership.tsx');

 expect(pkg.includes('"workspaces"'),'root must declare workspaces');
 expect(corePkg.includes('react-native-url-polyfill'),'mobile core must declare react-native-url-polyfill');
 expect(core.includes("rpc('map_network_nearby_v1'"),'native Nearby must share map_network_nearby_v1 authority');
 expect(core.includes("rpc('gamification_dashboard'")&&core.includes("rpc('get_progression_summary'")&&core.includes("rpc('get_user_leaderboard'"),'native progression must use canonical dashboard, summary and leaderboard RPCs');
 expect(core.includes("rpc('quest_list_available'")&&core.includes("rpc('quest_my_active_progress'")&&core.includes("rpc('quest_start'"),'native quests must use canonical quest authority');
 expect(core.includes("rpc('user_subscription_summary'")&&core.includes("from('pricing_catalog')"),'native membership must use canonical subscription and pricing authority');
 expect(!core.includes('stripe-create-checkout')&&!membership.includes('stripe-create-checkout')&&!membership.includes('stripe.com'),'native digital purchases must not use web Stripe checkout');
 expect(core.includes("rpc('create_route_plan'")&&core.includes('router.project-osrm.org'),'native Route must share persistence and OSRM authority');
 expect(core.includes("rpc('my_favorite_locations'")&&core.includes("rpc('kleenest_toggle_favorite'"),'native Saved must use canonical favorite RPCs');
 expect(core.includes("rpc('kleenest_map_check_in'")&&core.includes("rpc('create_review'"),'native location contribution must wire canonical check-in and review RPCs');
 expect(core.includes("from('reviews')")&&core.includes("eq('status','published')"),'native review reads must use published reviews');
 expect(activity.includes('listMyActivity')&&activity.includes('listMobileCommunityActivity'),'native Activity must separate private self activity from followed network activity');
 expect(activityService.includes("rpc('my_activity_feed'")&&!activityService.includes("from('social_activity')"),'native Activity self history must use canonical private RPC authority');
 expect(privateActivity.includes("rpc('my_activity_feed'")&&!privateActivity.includes("from('social_activity')"),'legacy mobile-core Activity export must use canonical private RPC authority');
 expect(publicEntry.includes("export { listMobileActivity } from './privateActivity'"),'mobile-core public entry must override legacy direct Activity implementation');
 expect(notificationInbox.includes("rpc('user_notifications'")&&notificationInbox.includes("rpc('mark_notification_read'")&&notificationInbox.includes("rpc('mark_all_notifications_read'")&&!notificationInbox.includes("from('notifications')"),'native notification center must use canonical self-scoped RPC lifecycle');
 expect(notifications.includes('listNotificationInbox')&&notifications.includes('markNotificationRead')&&notifications.includes('markAllNotificationsRead'),'native notification screen must wire constrained inbox lifecycle');
 expect(core.includes("rpc('community_following_members'")&&core.includes("rpc('community_follower_members'")&&core.includes("rpc('toggle_follow_user'")&&!core.includes("from('follows')"),'native social graph must use canonical trust-network follow RPCs only');
 expect(core.includes('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')&&!core.toLowerCase().includes('service_role'),'native client must use publishable credentials only');
 expect(appPkg.includes('"expo-router"')&&appPkg.includes('@kleenest/mobile-core')&&!appPkg.includes('workspace:*'),'native app must use installable Expo Router workspace dependencies');

 const primaryTabs=['index','explore','play','social','profile'];
 expect(primaryTabs.every(name=>layout.includes(`name=\"${name}\"`)),'primary consumer tabs must remain Home, Explore, Play, Community, Profile');
 for(const name of ['games','route','qr','saved','activity','notifications','membership','preferences','support','account-deletion'])expect(new RegExp(`name=[\"']${name}[\"'][^>]*href:\\s*null`).test(layout),`secondary consumer route ${name} must remain hidden from primary tabs`);
 expect(home.includes("'/explore'")&&home.includes('Find a better bathroom')&&home.includes('THE KLEENEST LOOP')&&home.includes('PLAY + PROGRESS')&&home.includes('YOUR NETWORK'),'Home must preserve bathroom-first rich consumer hierarchy');
 expect(explore.includes('listNearbyRestrooms')&&explore.includes('requestForegroundPermissionsAsync')&&explore.includes('listLocationTrustSummaries')&&explore.includes("pathname:'/route'")&&explore.includes('/location/'),'Explore must preserve bathroom discovery, trust, route and details handoff');
 expect(play.includes('getMobileLeaderboardPosition')&&play.includes('listMobileAvailableQuests')&&play.includes('listMobileActiveQuests')&&play.includes('startMobileQuest'),'Play must preserve progression and quest authority');
 expect(route.includes('Starting location + ordered stops')&&route.includes('buildMobileRoute')&&route.includes('persistMobileRoute')&&route.includes('SecureStore')&&route.includes('kleenest.native.route.draft'),'Route must preserve canonical routing and durable draft authority');
 expect(location.includes('toggleMobileFavorite')&&location.includes('mobileCheckIn')&&location.includes('createMobileReview')&&location.includes('rewardMessage'),'Location must preserve contribution actions and immediate progression feedback');
 expect(saved.includes('listMobileFavoriteLocations')&&saved.includes('/location/'),'Saved must consume canonical favorites and open locations');
 expect(social.includes('searchContributors')&&social.includes('toggleMobileFollow')&&social.includes('listMobileFollowing')&&social.includes('listMobileFollowers')&&social.includes('listMobileCommunityActivity'),'Community must preserve contributor discovery, follow graph and activity authority');
 expect(membership.includes('listMobilePricingCatalog')&&membership.includes('getMobileAccountSummary')&&membership.includes('App Store / Google Play billing'),'Membership must preserve native store billing boundary');
 expect(profile.includes('signInWithPassword')&&profile.includes('getMobileAccountSummary')&&profile.includes("'/social'")&&profile.includes("'/preferences'")&&profile.includes('Privacy & preferences'),'Profile must remain the rich account hub');
 expect(preferences.includes("rpc('get_my_profile_preferences'")&&preferences.includes("rpc('update_my_profile_preferences'"),'Profile preferences must use canonical self-scoped preference authority');
 expect(appConfig.includes("bundleIdentifier: 'com.kleenest.app'")&&appConfig.includes("package: 'com.kleenest.app'"),'native identifiers must remain canonical');
}

if(failures.length){
 console.error('Native authority audit failed:');
 for(const failure of failures)console.error(`- ${failure}`);
 process.exit(1);
}
console.log('Native authority audit passed.');
