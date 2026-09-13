import fs from 'node:fs';

const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const requireTokens=(label,source,tokens)=>{for(const token of tokens)if(!source.includes(token))failures.push(label+' missing '+token)};

const migration=read('supabase/migrations/20260913111500_fleet_member_workspace_consumer_tie.sql');
const control=read('apps/fleet-mobile/services/control.ts');
const layout=read('apps/fleet-mobile/app/_layout.tsx');
const member=read('apps/fleet-mobile/app/member.tsx');
const nearby=read('apps/fleet-mobile/app/nearby.tsx');
const locations=read('apps/fleet-mobile/services/locations.ts');
const map=read('apps/fleet-mobile/components/FleetMap.tsx');
const premium=read('apps/fleet-mobile/app/premium.tsx');
const product=read('apps/fleet-mobile/services/product.ts');
const geofence=read('apps/fleet-mobile/services/geofence.ts');

requireTokens('Fleet member authority',migration,[
 'fleet_product_enabled',
 'fleet_user_has_workspace_access',
 'fleet_current_user_workspace_manifest',
 'fleet_member_context',
 "workspace_role",
 "'operator'",
 "'driver'",
 "'member'",
 "'consumer_experience',true",
 "'route_execution',s.can_drive",
 "'route_geofencing',s.can_drive",
 "'dispatch_control',s.can_manage",
 'fleet_premium_limit',
 'coalesce(v_explicit,75)',
 'materialize_fleet_active_dwell_exceptions',
 "'route_stop_stall'",
 "'fleet-active-dwell-watch'",
 "rec.driver_user_id,'push'"
]);
requireTokens('Fleet observe gate',migration,[
 'create or replace function public.fleet_observe_access',
 'public.fleet_actor_is_manager(p_business_id)',
 'd.user_id=auth.uid()'
]);
if(migration.includes("select auth.uid() is not null\n     and coalesce((select a.fleet_enabled"))failures.push('Fleet observe access still allows unrelated authenticated users.');

requireTokens('Fleet workspace resolver',control,[
 'fleet_current_user_workspace_manifest',
 'FleetWorkspaceRole',
 'getFleetWorkspaceAccess',
 'getFleetMemberContext',
 'getFleetCurrentUserDispatch',
 'business_fleet_premium_limit'
]);
requireTokens('Fleet role gate',layout,[
 'MEMBER_ALLOWED',
 "workspaceRole==='operator'",
 "router.replace('/member')",
 'name="member"',
 'name="nearby"',
 "title:'For Me'",
 "title:'Nearby'"
]);
requireTokens('Fleet For Me',member,[
 'MY KLEENEST · FLEET',
 'route_execution',
 'Enable geofencing',
 'STALL RISK',
 'DWELL ·',
 'recordRouteStopTiming',
 'registerFleetPush',
 'Open full Kleenest',
 'Find nearby bathrooms',
 'setInterval(()=>setClock'
]);
requireTokens('Fleet nearby Consumer experience',nearby,[
 'KLEENEST FOR ME · FLEET CONNECTED',
 'SEARCH ANY AREA',
 'Home, work, school, address, city',
 'consumer_photo_url',
 'Start navigation',
 'Open full Kleenest',
 'mode="nearby"'
]);
requireTokens('Fleet consumer photos',locations,[
 'mobile_location_presentation_v1',
 'consumer_photo_storage_path',
 'consumer_photo_url',
 "storage.from('location-photos')"
]);
requireTokens('Fleet map consumer photos',map,['consumer_photo_url',"mode='planner'","mode==='nearby'"]);
requireTokens('Fleet ad-hoc geofence support',geofence,['location_id:string|null','locationId:string|null','p_location_id:ids.locationId']);
if(geofence.includes('!ids.locationId'))failures.push('Fleet background geofence still rejects ad-hoc route stops without canonical location IDs.');
requireTokens('Fleet Premium capacity',premium,['getFleetPremiumLimit','75 by default',' / {limit} active']);
requireTokens('Fleet parity ledger',product,['role-gated-member-workspace','consumer-nearby-discovery','assigned-driver-route','dwell-stall-awareness']);

if(failures.length){
 console.error('Fleet member workspace audit failed:');
 for(const failure of failures)console.error('- '+failure);
 process.exit(1);
}
console.log('Fleet member workspace audit passed: operator, driver and member gates converge Consumer discovery, Premium, assigned-route execution, geofencing, notifications, dwell/stall awareness and selected location photos.');
