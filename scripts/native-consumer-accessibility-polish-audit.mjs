import fs from 'node:fs';
const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const ui=read('apps/consumer-mobile/components/ConsumerUI.tsx');
const config=read('apps/consumer-mobile/app.config.ts');
const exploreEntry=read('apps/consumer-mobile/app/explore.tsx');
const adaptiveExplore=read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');
const explore=`${exploreEntry}\n${adaptiveExplore}`;
const qr=read('apps/consumer-mobile/app/qr.tsx');
const location=read('apps/consumer-mobile/app/location/[id].tsx');
const notifications=read('apps/consumer-mobile/app/notifications.tsx');
const interactionFiles=[
  'apps/consumer-mobile/app/signup.tsx',
  'apps/consumer-mobile/app/profile.tsx',
  'apps/consumer-mobile/app/social.tsx',
  'apps/consumer-mobile/app/progress.tsx',
  'apps/consumer-mobile/app/games.tsx',
  'apps/consumer-mobile/app/discover.tsx',
  'apps/consumer-mobile/app/knowledge.tsx',
  'apps/consumer-mobile/app/assistant.tsx',
  'apps/consumer-mobile/app/family.tsx',
  'apps/consumer-mobile/app/messages.tsx',
  'apps/consumer-mobile/app/notifications.tsx',
  'apps/consumer-mobile/app/account-deletion.tsx',
  'apps/consumer-mobile/app/access.tsx',
  'apps/consumer-mobile/app/live-network.tsx',
  'apps/consumer-mobile/app/membership.tsx',
  'apps/consumer-mobile/app/play.tsx',
  'apps/consumer-mobile/app/route.tsx',
  'apps/consumer-mobile/app/saved.tsx',
  'apps/consumer-mobile/app/legal.tsx',
  'apps/consumer-mobile/app/week-in-review.tsx',
  'apps/consumer-mobile/app/search.tsx',
  'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  'apps/consumer-mobile/components/BetaReportButton.tsx',
  'apps/consumer-mobile/components/SponsoredSlot.tsx',
];
const requiredUi=['accessibilityRole="button"','accessibilityRole="header"','accessibilityLabel={label}','accessibilityHint={body}','hitSlop={actionHitSlop}','minHeight:48'];
for(const token of requiredUi)if(!ui.includes(token))failures.push(`Shared consumer accessibility primitive missing ${token}`);
if(!ui.includes('accessible accessibilityLabel')||!ui.includes('MetricTile')||!ui.includes('HeroCard'))failures.push('Shared cards and metrics must expose concise screen-reader summaries.');
for(const token of ["'ACCESS_COARSE_LOCATION'","'ACCESS_FINE_LOCATION'","'CAMERA'",'NSLocationWhenInUseUsageDescription','cameraPermission'])if(!config.includes(token))failures.push(`Native permission configuration missing ${token}`);
if(!exploreEntry.includes('AdaptiveExploreScreen'))failures.push('Explore entry must resolve to the canonical adaptive Explore implementation.');
if(!/permission\.status\s*!==?\s*['"]granted['"]/.test(explore)||!/Enable it in (?:your )?phone settings and try again\./.test(explore))failures.push('Explore must explain denied location permission and recovery.');
if(!location.includes("permission.status!=='granted'")||!location.includes('Location permission is required to check in.'))failures.push('Verified check-in must fail clearly when location permission is unavailable.');
if(!qr.includes('Camera permission is needed to scan.')||!qr.includes('enter the QR code manually'))failures.push('QR must provide explicit camera denial recovery through manual entry.');
if(!notifications.includes('Registering this device')||!notifications.includes('Push notifications could not be enabled.'))failures.push('Notification setup must expose progress and failure states.');
for(const file of interactionFiles){
  const source=read(file);
  for(const match of source.matchAll(/<Pressable\b[\s\S]*?>/g))if(!match[0].includes('accessibilityRole='))failures.push(`${file} has a Pressable without an accessibilityRole.`);
  for(const match of source.matchAll(/<TextInput\b[\s\S]*?>/g))if(!match[0].includes('accessibilityLabel='))failures.push(`${file} has a TextInput without an accessibilityLabel.`);
  for(const match of source.matchAll(/<Modal\b[\s\S]*?>/g))if(!match[0].includes('accessibilityViewIsModal'))failures.push(`${file} has a Modal without accessibilityViewIsModal.`);
}
const discover=read('apps/consumer-mobile/app/discover.tsx');
for(const token of ["function editCoordinate(axis:'lat'|'lon',value:string)","setAccuracy(null)","setMethod('map_pin')","onChangeText={value=>editCoordinate('lat',value)}","onChangeText={value=>editCoordinate('lon',value)}"])if(!discover.includes(token))failures.push(`Discover evidence provenance downgrade missing ${token}`);
const social=read('apps/consumer-mobile/app/social.tsx');
for(const token of ['disabled={Boolean(r.is_current_user)}','disabled={!item.locationId}',"item.locationId?<Text style={[s.openLink"])if(!social.includes(token))failures.push(`Community dead-tap guard missing ${token}`);
const stateSources={
  'apps/consumer-mobile/app/explore.tsx':explore,
  'apps/consumer-mobile/app/location/[id].tsx':location,
  'apps/consumer-mobile/app/activity.tsx':read('apps/consumer-mobile/app/activity.tsx'),
  'apps/consumer-mobile/app/notifications.tsx':notifications,
  'apps/consumer-mobile/app/saved.tsx':read('apps/consumer-mobile/app/saved.tsx'),
};
for(const [file,source] of Object.entries(stateSources))if(!/Loading|loading|Finding|Searching|No |could not|unavailable|failed/i.test(source))failures.push(`${file} must expose loading/empty/error or unavailable state copy.`);
if(failures.length){console.error('Native consumer accessibility/polish audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native consumer accessibility/polish audit passed.');
