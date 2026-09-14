import fs from 'node:fs';

const failures=[];
const read=(path)=>fs.readFileSync(path,'utf8');
const expect=(source,token,label)=>{if(!source.includes(token))failures.push(label);};

const home=read('apps/consumer-mobile/app/index.tsx');
for(const [token,label] of [
  ['FIND A BATHROOM','consumer Home must keep bathroom discovery first'],
  ['<Text style={s.heroQuickLabel}>REVIEW</Text>','consumer Home must make recent-visit review easy to find'],
  ['accessibilityLabel="Scan a Kleenest QR code"','consumer Home must keep QR as a separate optional path'],
]) expect(home,token,label);
if(home.includes('Scan QR to check in or review')) failures.push('consumer Home must not teach users that QR is the general check-in entry point');
if(home.includes('GPS + geofence')||home.includes('verification window')) failures.push('consumer Home must not expose check-in implementation terminology');

const explore=read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');
for(const [token,label] of [
  ['mobileCheckIn','native Explore must preserve canonical explicit check-in authority'],
  ['accessibilityLabel="Check in at selected location"','selected map place must keep optional explicit Check in'],
  ['Review this visit','native Explore must make review the primary post-visit action'],
  ['>Go</Text>','native Explore must keep one-tap directions prominent'],
  ['OUTSIDE_GEOFENCE','native Explore may map internal check-in qualification errors to human copy'],
]) expect(explore,token,label);
if(explore.includes('inside the geofence')||explore.includes('GPS + geofence')) failures.push('native Explore must not expose geofence implementation language in user-facing copy');

const location=read('apps/consumer-mobile/app/location/[id].tsx');
for(const [token,label] of [
  ["'✓ Check in'",'location detail must keep explicit Check in available as a secondary action'],
  ['Review this visit','location detail must make Review this visit the primary contribution path'],
  ["router.push('/qr')",'location detail must keep QR available as an optional path'],
]) expect(location,token,label);
if(location.includes('GPS + geofence')||location.includes('inside the geofence')) failures.push('location detail must not expose check-in implementation terminology in normal UX');

const route=read('apps/consumer-mobile/app/route.tsx');
for(const [token,label] of [
  ['arrivalPrompts','route must expose opt-in arrival prompts'],
  ['watchPositionAsync','route arrival prompts must use foreground location'],
  ['mobileCheckIn','route stops must support canonical check-in'],
  ['arriveMobileRouteStop','saved route stop arrival must link to the verified check-in'],
  ['never silently checks you in','arrival detection must not silently create a user check-in'],
]) expect(route,token,label);

const qrScreen=read('apps/consumer-mobile/app/qr.tsx');
for(const [token,label] of [
  ['accessibilityLabel="Check in without a QR"','QR screen must offer a normal check-in escape hatch'],
  ['Check in without QR','QR screen must explain that QR is optional'],
  ['Check in at this location','QR screen must offer the normal location-based check-in path'],
]) expect(qrScreen,token,label);
if(qrScreen.includes('GPS + geofence')||qrScreen.includes('inside the location geofence')) failures.push('QR screen must not expose location-verification implementation terminology');

const qr=read('apps/consumer-mobile/services/qrActions.ts');
expect(qr,"rpc('verify_checkin'",'QR check-in must use the existing server-authoritative QR + geofence RPC');

const core=read('packages/mobile-core/src/index.ts');
for(const [token,label] of [
  ['geofence_radius_m','mobile location data must expose the canonical check-in radius'],
  ["rpc('arrive_route_stop'",'mobile core must expose verified route arrival linkage'],
]) expect(core,token,label);

const webExplore=read('src/runtime/ExplorePage.jsx');
for(const [token,label] of [
  ['checkInAtLocation','web Explore must use the canonical check-in service'],
  ['Check in','web Explore cards and selected map place must expose Check in'],
]) expect(webExplore,token,label);

const webRoute=read('src/runtime/RoutePage.jsx');
for(const [token,label] of [
  ['checkInAtLocation','web Route must use the canonical check-in service'],
  ['Check in','web route stops must expose Check in'],
]) expect(webRoute,token,label);

if(failures.length){
  console.error('Consumer multi-path check-in audit failed:');
  failures.forEach((failure)=>console.error('- '+failure));
  process.exit(1);
}

console.log('Consumer multi-path check-in audit passed: explicit check-in remains available without becoming a prerequisite for the find → go → review journey.');
