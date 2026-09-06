import fs from 'node:fs';

const failures=[];
const required=[
  'apps/consumer-mobile/app/_layout.tsx','apps/consumer-mobile/app/index.tsx','apps/consumer-mobile/app/explore.tsx','apps/consumer-mobile/features/AdaptiveExploreScreen.tsx','apps/consumer-mobile/app/discover.tsx','apps/consumer-mobile/app/progress.tsx','apps/consumer-mobile/app/location/[id].tsx','apps/consumer-mobile/app/profile.tsx','apps/consumer-mobile/app/preferences.tsx','apps/consumer-mobile/app/play.tsx','apps/consumer-mobile/app/social.tsx','apps/consumer-mobile/app/saved.tsx','apps/consumer-mobile/app/route.tsx','apps/consumer-mobile/app/qr.tsx','apps/consumer-mobile/app/activity.tsx','apps/consumer-mobile/app/notifications.tsx','apps/consumer-mobile/app/membership.tsx','apps/consumer-mobile/app/support.tsx','apps/consumer-mobile/app/account-deletion.tsx','packages/mobile-core/src/index.ts','apps/consumer-mobile/package.json','apps/consumer-mobile/app.config.ts'
];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing consumer migration file: ${file}`);
if(!failures.length){
  const read=file=>fs.readFileSync(file,'utf8');
  const [layout,home,exploreEntry,adaptiveExplore,discover,progress,location,profile,preferences,play,social,saved,route,qr,activity,notifications,membership,support,deletion,core,mobilePackage,appConfig]=required.map(read);
  const explore=`${exploreEntry}\n${adaptiveExplore}`;
  if(!exploreEntry.includes('AdaptiveExploreScreen'))failures.push('Explore entry must resolve to the canonical adaptive Explore implementation.');
  for(const [name,title] of [['index','Home'],['explore','Explore'],['progress','Progress'],['social','Community'],['profile','Profile']]){
    if(!layout.includes(`name="${name}"`)||!layout.includes(`title:'${title}'`))failures.push(`primary consumer tab missing or renamed: ${title}`);
  }
  for(const hidden of ['play','discover','games','route','qr','saved','activity','notifications','membership','preferences','support','account-deletion'])if(!new RegExp(`name=["']${hidden}["'][^>]*href:\\s*null`).test(layout))failures.push(`secondary consumer route must remain reachable but hidden from primary tabs: ${hidden}`);
  for(const forbidden of ['Business','Fleet','Enterprise','Admin','Owner Control'])if(new RegExp(`title:\\s*['"]${forbidden}`).test(layout))failures.push(`consumer tab shell must not expose operations workspace: ${forbidden}`);
  for(const token of ["'/explore'",'/saved','/qr','THE KLEENEST LOOP','YOUR NETWORK','/discover','/progress'])if(!home.includes(token))failures.push(`Home missing rich discovery/progression activation capability: ${token}`);
  for(const token of ['listNearbyRestrooms','listAmenityCatalog','selectedAmenityNames','captureConsumerRouteIntent','navigateUrl','listLocationTrustSummaries','readNearbyCache','writeNearbyCache'])if(!explore.includes(token))failures.push(`Explore missing mature discovery capability: ${token}`);
  if(!/pathname\s*:\s*['"]\/route['"]/.test(explore))failures.push('Explore missing mature discovery capability: route navigation');
  for(const token of ['remote','address','place_search','map_pin','gps','onsite_live','saveDiscovery','saveEvidence','choosePhoto'])if(!discover.includes(token))failures.push(`Discover missing canonical contribution capability: ${token}`);
  for(const token of ['SPECIALTY LEVELS','WHAT TO DO NEXT','BADGES','RANKINGS','XP HISTORY'])if(!progress.includes(token))failures.push(`Progress missing canonical progression capability: ${token}`);
  for(const token of ['mobileCheckIn','createMobileReview','recordReviewAmenityInventory','uploadReviewPhotos','progressionSnapshot','completeTrustMission'])if(!location.includes(token))failures.push(`Location contribution loop missing: ${token}`);
  for(const token of ['getMobileProgressionDashboard','getMobileLeaderboardPosition','listMobileBadges','listMobileActiveQuests','listMobileFollowing','listMobileFollowers','changePassword','Contribution history','Saved bathrooms','Game Center','Membership','View my public profile','Privacy & preferences','Support'])if(!profile.includes(token))failures.push(`Profile hub missing donor-parity capability: ${token}`);
  if(!profile.includes("client.rpc('update_my_public_profile'")||!profile.includes('chooseAndUploadAvatar')||!profile.includes('client.auth.updateUser({password:newPassword})'))failures.push('Profile identity mutations must remain canonical profile/avatar/auth operations.');
  for(const token of ['get_my_profile_preferences','update_my_profile_preferences','profile_visibility','show_activity','show_checkins','show_reviews','allow_followers','discoverable'])if(!preferences.includes(token))failures.push(`Profile preferences missing donor-parity control: ${token}`);
  for(const token of ['getMobileProgressionDashboard','listMobileBadges','listMobileChallenges','listMobileContests','listMobileLeaderboard','listMobileActiveQuests'])if(!play.includes(token))failures.push(`Legacy Play compatibility missing progression capability: ${token}`);
  for(const token of ['listMobileCommunityActivity','listMobileFollowing','listMobileFollowers','toggleMobileFollow','searchContributors'])if(!social.includes(token))failures.push(`Community missing relationship/evidence capability: ${token}`);
  for(const token of ['listMobileFavoriteLocations','applyTrustDiscoveryControls','readTrustMission','Add to route'])if(!saved.includes(token))failures.push(`Saved missing mature consumer capability: ${token}`);
  for(const token of ['buildMobileRoute','persistMobileRoute','GeoJSONSource','mobileNavigationUrl'])if(!route.includes(token))failures.push(`Route missing canonical navigation capability: ${token}`);
  for(const token of ['resolveQrAction','executeQrAction','TextInput','trust_mission','CameraView','useCameraPermissions',"barcodeTypes:['qr']",'onBarcodeScanned','scanLocked'])if(!qr.includes(token))failures.push(`QR consumer entry missing canonical camera/fallback capability: ${token}`);
  if(!qr.includes('void resolve(data)')||!qr.includes('executeQrAction(value)'))failures.push('Camera scans must converge through the same QR resolver and execution authority as deep links/manual entry.');
  if(!mobilePackage.includes('"expo-camera": "~57.0.4"'))failures.push('Consumer mobile must pin the Expo 57-compatible camera dependency.');
  if(!appConfig.includes("['expo-camera', { cameraPermission: 'Kleenest uses your camera to scan Kleenest restroom QR codes.' }]")||!appConfig.includes("'CAMERA'"))failures.push('Native app configuration must declare explicit QR camera permission and plugin configuration.');
  if(!/Activity|ACTIVITY/.test(activity))failures.push('Activity consumer surface missing.');
  if(!notifications.includes('notification'))failures.push('Notification inbox missing.');
  if(!/pricing|Membership/.test(membership))failures.push('Membership consumer surface missing.');
  if(!support.includes('submitSupportRequest')||!support.includes('listMySupportRequests'))failures.push('Canonical account-linked support surface missing.');
  if(!deletion.includes('deletion'))failures.push('Protected account-deletion surface missing.');
  for(const token of ['getMobileAccountSummary','getMobileProgressionDashboard','listMobileActivity','listMobileCommunityActivity','buildMobileRoute','persistMobileRoute'])if(!core.includes(token))failures.push(`Mobile core missing canonical consumer authority: ${token}`);
  if(/\.rpc\(['"](?:business|fleet|enterprise|admin)_/i.test(profile))failures.push('Profile must not call operations-plane RPC authority.');
}
if(failures.length){console.error('Consumer bulk migration convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Consumer bulk migration convergence audit passed.');
