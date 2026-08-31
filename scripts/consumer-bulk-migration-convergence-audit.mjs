import fs from 'node:fs';

const failures=[];
const required=[
  'apps/consumer-mobile/app/_layout.tsx',
  'apps/consumer-mobile/app/index.tsx',
  'apps/consumer-mobile/app/explore.tsx',
  'apps/consumer-mobile/app/location/[id].tsx',
  'apps/consumer-mobile/app/profile.tsx',
  'apps/consumer-mobile/app/play.tsx',
  'apps/consumer-mobile/app/social.tsx',
  'apps/consumer-mobile/app/saved.tsx',
  'apps/consumer-mobile/app/route.tsx',
  'apps/consumer-mobile/app/qr.tsx',
  'apps/consumer-mobile/app/activity.tsx',
  'apps/consumer-mobile/app/notifications.tsx',
  'apps/consumer-mobile/app/membership.tsx',
  'apps/consumer-mobile/app/account-deletion.tsx',
  'packages/mobile-core/src/index.ts'
];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing consumer migration file: ${file}`);
if(!failures.length){
  const read=file=>fs.readFileSync(file,'utf8');
  const [layout,home,explore,location,profile,play,social,saved,route,qr,activity,notifications,membership,deletion,core]=required.map(read);
  for(const [name,title] of [['index','Home'],['explore','Explore'],['play','Play'],['social','Community'],['profile','Profile']])if(!layout.includes(`<Tabs.Screen name="${name}" options={{ title: '${title}' }}/>`)&&!layout.includes(`<Tabs.Screen name="${name}" options={{ title: "${title}" }}/>`)&&!layout.includes(`<Tabs.Screen name="${name}" options={{ title: '${title}'`))failures.push(`primary consumer tab missing or renamed: ${title}`);
  for(const hidden of ['games','route','qr','saved','activity','notifications','membership','support','account-deletion'])if(!layout.includes(`name="${hidden}" options={{ href: null }}`))failures.push(`secondary consumer route must remain reachable but hidden from primary tabs: ${hidden}`);
  for(const forbidden of ['Business','Fleet','Enterprise','Admin','Owner Control'])if(layout.includes(`title: '${forbidden}'`)||layout.includes(`title: "${forbidden}"`))failures.push(`consumer tab shell must not expose operations workspace: ${forbidden}`);
  for(const token of ['FIND A BATHROOM','/explore','/saved','/qr'])if(!home.includes(token))failures.push(`Home missing bathroom-first activation token: ${token}`);
  for(const token of ['listAmenityCatalog','selectedAmenityNames','Add to route','Directions','Details'])if(!explore.includes(token))failures.push(`Explore missing mature discovery capability: ${token}`);
  for(const token of ['mobileCheckIn','createMobileReview','recordReviewAmenityInventory','uploadReviewPhotos','progressionSnapshot','completeTrustMission'])if(!location.includes(token))failures.push(`Location contribution loop missing: ${token}`);
  for(const token of ['getMobileProgressionDashboard','getMobileLeaderboardPosition','listMobileBadges','listMobileActiveQuests','listMobileFollowing','listMobileFollowers','Change password','Contribution history','Saved bathrooms','Game Center','Membership','View my public profile'])if(!profile.includes(token))failures.push(`Profile hub missing donor-parity capability: ${token}`);
  if(!profile.includes("client.rpc('update_my_public_profile'")||!profile.includes('chooseAndUploadAvatar')||!profile.includes('client.auth.updateUser({password:newPassword})'))failures.push('Profile identity mutations must remain canonical profile/avatar/auth operations.');
  for(const token of ['getMobileProgressionDashboard','listMobileBadges','listMobileChallenges','listMobileContests','listMobileLeaderboard','listMobileActiveQuests'])if(!play.includes(token))failures.push(`Play missing progression capability: ${token}`);
  for(const token of ['listMobileCommunityActivity','listMobileFollowing','listMobileFollowers','toggleMobileFollow'])if(!social.includes(token))failures.push(`Community missing relationship/evidence capability: ${token}`);
  for(const token of ['listMobileFavoriteLocations','applyTrustDiscoveryControls','readTrustMission','Add to route'])if(!saved.includes(token))failures.push(`Saved missing mature consumer capability: ${token}`);
  for(const token of ['buildMobileRoute','persistMobileRoute','GeoJSONSource','mobileNavigationUrl'])if(!route.includes(token))failures.push(`Route missing canonical navigation capability: ${token}`);
  if(!qr.includes('QR')||!qr.includes('location'))failures.push('QR consumer entry must remain present and location-oriented.');
  if(!activity.includes('Activity')&&!activity.includes('ACTIVITY'))failures.push('Activity consumer surface missing.');
  if(!notifications.includes('notification'))failures.push('Notification inbox missing.');
  if(!membership.includes('pricing')&&!membership.includes('Membership'))failures.push('Membership consumer surface missing.');
  if(!deletion.includes('deletion'))failures.push('Protected account-deletion surface missing.');
  for(const token of ['getMobileAccountSummary','getMobileProgressionDashboard','listMobileActivity','listMobileCommunityActivity','buildMobileRoute','persistMobileRoute'])if(!core.includes(token))failures.push(`Mobile core missing canonical consumer authority: ${token}`);
  if(/business_|fleet_|enterprise_|admin_/i.test(profile))failures.push('Profile must not import operations-plane RPC authority.');
}
if(failures.length){console.error('Consumer bulk migration convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Consumer bulk migration convergence audit passed.');
