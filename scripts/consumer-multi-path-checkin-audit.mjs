import fs from 'node:fs';

const failures=[];
const read=(path)=>fs.readFileSync(path,'utf8');
const expect=(source,token,label)=>{if(!source.includes(token))failures.push(label);};

const home=read('apps/consumer-mobile/app/index.tsx');
const heroRelevance=read('apps/consumer-mobile/services/heroRelevance.ts');
for(const [token,label] of [
  ["kind:'check_in'",'consumer Home must expose a first-class organic check-in action'],
  ["eyebrow:'CHECK IN'",'consumer Home must label check-in independently of QR'],
  ["cta:'Nearby or search'",'consumer Home check-in must lead users toward GPS/search location selection'],
  ["kind:'scan_qr'",'consumer Home must keep QR as a separate optional verification path'],
  ["QR stays optional proof—not the general check-in path.",'consumer Home must explain QR as optional proof rather than general check-in'],
]) expect(heroRelevance,token,label);
if(home.includes('Scan QR to check in or review')||heroRelevance.includes('Scan QR to check in or review')) failures.push('consumer Home must not teach users that QR is the general check-in entry point');

const explore=read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');
for(const [token,label] of [
  ['mobileCheckIn','native Explore must use the canonical GPS check-in RPC'],
  ['onCheckIn','native Explore result cards must expose Check in'],
  ['Check in','native Explore selected map place must expose Check in'],
  ['OUTSIDE_GEOFENCE','native Explore must explain geofence qualification'],
  ['Review verified visit','native Explore must turn a successful check-in into a direct verified-review action'],
  ['verification_expires_at','native Explore must surface the timed verification window returned by check-in'],
  ['Exact place + GPS verified','native Explore must explicitly confirm target-authoritative GPS verification'],
]) expect(explore,token,label);

const location=read('apps/consumer-mobile/app/location/[id].tsx');
for(const [token,label] of [
  ['CHECK IN HERE','location detail must make Check in explicit'],
  ['GPS + geofence','location detail must explain GPS verification'],
  ["router.push('/qr')",'location detail must keep QR available as an optional stronger proof path'],
]) expect(location,token,label);

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
  ['accessibilityLabel="Check in without a QR"','QR screen must offer a GPS/search escape hatch for regular check-in'],
  ['Check in with GPS + geofence','QR screen must explain that a QR is not required for normal check-in'],
]) expect(qrScreen,token,label);

const qr=read('apps/consumer-mobile/services/qrActions.ts');
expect(qr,"rpc('verify_checkin'",'QR check-in must use the existing server-authoritative QR + geofence RPC');

const core=read('packages/mobile-core/src/index.ts');
const locationCore=read('packages/mobile-core/src/locations.ts');
const routeCore=read('packages/mobile-core/src/routes.ts');
expect(core,"export * from './locations'",'mobile core must publicly re-export the canonical location domain');
expect(core,"export * from './routes'",'mobile core must publicly re-export the canonical route domain');
expect(locationCore,'geofence_radius_m','mobile location data must expose the canonical check-in radius');
expect(routeCore,"rpc('arrive_route_stop'",'mobile route domain must expose verified route arrival linkage');

const targetAuthority=read('supabase/migrations/20260914164721_explicit_checkin_target_authority.sql');
for(const [token,label] of [
  ["'explicit_target',true",'explicit check-in must mark the chosen place as the authoritative presence target'],
  ["'presence_visit_id',v_presence.id",'check-in evidence must link to the exact presence visit'],
  ["'review_ready',true",'new verified check-ins must explicitly open the verified-review path'],
  ["'progression_cap_reached',v_progression_cap_reached",'check-in must report progression capping without rejecting the visit'],
]) expect(targetAuthority,token,label);
if(targetAuthority.includes('consumer_presence_heartbeat(p_lat,p_lng)')) failures.push('explicit check-in must never delegate target selection to the generic nearest-place heartbeat');
if(targetAuthority.includes("raise exception 'DAILY_PROGRESSION_CAP_REACHED'")) failures.push('daily XP caps must not reject a legitimate verified check-in');

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

console.log('Consumer multi-path check-in audit passed: Home, GPS/geofence, QR, Explore, location detail, route stops, opt-in arrival prompts, and web parity converge on server-authoritative check-in paths.');
