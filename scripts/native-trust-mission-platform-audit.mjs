import fs from 'node:fs';
const failures=[];
const required=[
  'apps/consumer-mobile/services/trustMissions.ts',
  'apps/consumer-mobile/services/activity.ts',
  'apps/consumer-mobile/app/activity.tsx',
  'apps/consumer-mobile/app/progress.tsx',
  'apps/consumer-mobile/services/notificationRouting.ts',
  'apps/consumer-mobile/app/explore.tsx',
  'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  'apps/consumer-mobile/app/saved.tsx',
  'apps/consumer-mobile/app/location/[id].tsx',
  'supabase/migrations/20260831082000_mobile_trust_mission_platform_authority.sql',
  'supabase/migrations/20260831082500_mobile_trust_mission_tiered_rewards.sql',
  'supabase/migrations/20260831083500_mobile_trust_mission_start_preserves_active_authority.sql'
];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing trust mission platform file: ${file}`);
if(!failures.length){
  const read=file=>fs.readFileSync(file,'utf8');
  const service=read(required[0]),activityService=read(required[1]),activityScreen=read(required[2]),progress=read(required[3]),routing=read(required[4]),exploreEntry=read(required[5]),adaptiveExplore=read(required[6]),explore=`${exploreEntry}\n${adaptiveExplore}`,saved=read(required[7]),location=read(required[8]),base=read(required[9]),tiered=read(required[10]),preserve=read(required[11]);
  if(!exploreEntry.includes('AdaptiveExploreScreen'))failures.push('Explore entry must resolve to the canonical adaptive Explore screen.');
  for(const rpc of ['start_my_trust_mission','my_trust_mission','my_trust_mission_history','complete_my_trust_mission','cancel_my_trust_mission'])if(!service.includes(rpc))failures.push(`mobile trust mission service missing RPC: ${rpc}`);
  if(!service.includes('getKleenestSupabaseClient')||!service.includes('SecureStore')||!service.includes('offlineMirror'))failures.push('Trust mission service must use server authority with SecureStore only as an offline mirror.');
  if(!service.includes("client.from('reviews')")||!service.includes(".not('check_in_id','is',null)"))failures.push('Mission completion must resolve a published verified review before calling server completion authority.');
  if(!service.includes("TrustMissionAction='start'|'resume'|'active_elsewhere'")||!service.includes('trustMissionAction(active')||!service.includes("return active.locationId===locationId?'resume':'active_elsewhere'"))failures.push('Mission service must model start, resume, and active-elsewhere states explicitly.');
  if(!service.includes('cancelledAt')||!service.includes('trustMissionRewardTier')||!service.includes('trustMissionRewardLabel')||!service.includes('trustMissionStatusLine'))failures.push('Mission service must centralize history timestamps and reward/status semantics.');
  if(!service.includes("if(active.locationId===locationId)return active")||!service.includes('Resume it or clear it from Progress before starting another.'))failures.push('Mission service must preserve an active mission rather than silently replacing it.');
  if(!service.includes("const {error}=await client.rpc('cancel_my_trust_mission')")||!service.includes('if(error)throw error;await cache(null)'))failures.push('Mission cancellation must clear the local mirror only after the server confirms cancellation.');
  if(/clearTrustMission\(\)\{try[\s\S]*finally\{await cache\(null\)/.test(service))failures.push('Mission cancellation must not clear the local mirror from a finally block after a failed server request.');
  for(const token of ['create table if not exists public.user_trust_missions','user_trust_missions_one_active_idx','enable row level security','revoke all on table public.user_trust_missions from public, anon, authenticated'])if(!base.includes(token))failures.push(`Base mission authority missing: ${token}`);
  for(const fn of ['start_my_trust_mission','my_trust_mission','my_trust_mission_history','cancel_my_trust_mission','complete_my_trust_mission'])if(!base.includes(`function public.${fn}`))failures.push(`Base mission migration missing function ${fn}`);
  if(!base.includes("set search_path=''"))failures.push('Mission RPCs must be hardened with an empty search path.');
  if(!tiered.includes('trust_mission_visit_bonus')||!tiered.includes('v_goal_satisfied')||!tiered.includes("case when v_goal_satisfied then 'trust_mission_bonus' else 'trust_mission_visit_bonus' end"))failures.push('Tiered mission rewards must distinguish full evidence goals from verified-visit completion.');
  if(!tiered.includes("'trust_mission_completed','trust_mission'")||!tiered.includes('quest_dispatch_event')||!tiered.includes("'trust_mission_completed'"))failures.push('Mission completion must converge progression metrics, quests, and activity.');
  if(!tiered.includes("'progress_trust_mission_completed'")||!tiered.includes("'goal_satisfied',v_goal_satisfied")||!tiered.includes("'location_id',v_mission.location_id"))failures.push('Mission completion notification must preserve progress, location, and goal-satisfaction context.');
  if(!preserve.includes('select * into v_active')||!preserve.includes("where user_id=v_user and status='active'")||!preserve.includes('for update'))failures.push('Server mission start must lock and inspect the current active mission before creating another.');
  if(!preserve.includes('if v_active.location_id=p_location_id then')||!preserve.includes('An active trust mission already exists at'))failures.push('Server mission start must resume the same location and reject a different active mission.');
  if(/set status='cancelled'.*status='active'/is.test(preserve))failures.push('Server mission start must never cancel an active mission as a side effect of starting another.');
  if(!preserve.includes("set search_path=''" )||!preserve.includes('revoke all on function public.start_my_trust_mission(uuid,text) from public,anon'))failures.push('Server mission-start preservation authority must keep the hardened execution boundary.');
  if(!activityService.includes("activityType==='trust_mission_completed'")||!activityService.includes('Completed a trust mission')||!activityService.includes('Full evidence goal')||!activityService.includes('Verified visit goal')||!activityService.includes('goalSatisfied')||!activityService.includes('rewardPoints'))failures.push('Personal Activity service must preserve mission completion tier and reward context.');
  if(!activityScreen.includes('TRUST MISSION')||!activityScreen.includes('FULL EVIDENCE')||!activityScreen.includes('VERIFIED VISIT')||!activityScreen.includes('View strengthened restroom'))failures.push('Activity must visibly distinguish mission reward tiers and deep-link to the strengthened restroom.');

  // Progress is the canonical progression hub. Verify active mission authority and restroom
  // navigation without restoring legacy Play ownership of progression.
  if(!progress.includes('readTrustMission')||!progress.includes('ACTIVE TRUST MISSION')||!progress.includes('activeMission.locationName')||!progress.includes("pathname:'/location/[id]'" )||!progress.includes('Resume mission')||!progress.includes('Clear mission'))failures.push('Progress must surface authoritative active mission state and restroom navigation.');
  if(!progress.includes('clearTrustMission')||!progress.includes('try{await clearTrustMission();setActiveMission(null)'))failures.push('Progress mission clearing must be explicit and clear local active state only after server cancellation succeeds.');
  if(!progress.includes("catch(error:any){setMessage(error?.message||'Trust mission could not be cleared.')"))failures.push('Progress must surface mission-clear failures while preserving active mission state.');

  if(!routing.includes('isTrustMission')||!routing.includes("if(isTrustMission(data,type)&&locationId)return`/location/${encodeURIComponent(locationId)}`"))failures.push('Trust mission notifications with a location must deep-link to that restroom before generic progress routing.');
  if(!routing.includes("if(isProgress(data,type))return stringValue(data.game_challenge_id)||type.includes('game')||type.includes('challenge')?'/games':'/progress'"))failures.push('Non-location progression notifications must route to canonical Progress or Game Center.');
  if(!routing.includes("if(explicit)return explicit==='/play'?'/progress':explicit;"))failures.push('Legacy explicit Play notification destinations must normalize to canonical Progress.');

  // Trust missions remain a consumer capability, but they are intentionally kept out of the
  // critical bathroom-finding path. Saved, Progress, Location, Activity, and notifications own
  // mission lifecycle; Explore stays bathroom-first while retaining its mature discovery paths.
  if(explore.includes('readTrustMission')||explore.includes('trustMissionAction')||explore.includes('ACTIVE TRUST MISSION')||explore.includes('NEARBY TRUST MISSION'))failures.push('Explore must stay bathroom-first; trust mission lifecycle belongs to Progress, Saved, and Location.');
  const bathroomFirst=[
    ['nearby search',explore.includes('findAdaptiveNearbyRestrooms')&&explore.includes('listNearbyRestrooms')],
    ['trust summaries',explore.includes('listLocationTrustSummaries')&&explore.includes('attachLocationTrust')],
    ['full details action',explore.includes('Full details')&&explore.includes('router.push(`/location/${idOf(selected)}`)')],
    ['directions action',explore.includes('Directions')&&explore.includes('Linking.openURL')],
    ['route handoff',explore.includes("pathname:'/route'")&&explore.includes('captureConsumerRouteIntent')],
  ];
  for(const [name,present] of bathroomFirst)if(!present)failures.push(`Explore bathroom-first mission boundary missing ${name}.`);

  if(!saved.includes('readTrustMission')||!saved.includes('trustMissionAction'))failures.push('Saved must load and evaluate the active trust mission.');
  if(!saved.includes('Resume mission')||!saved.includes('View active mission')||!saved.includes('Resume active mission'))failures.push('Saved must expose active/resume mission states clearly.');
  if(!saved.includes("action==='active_elsewhere'")||!saved.includes("router.push('/progress')"))failures.push('Saved must preserve an active mission and route replacement decisions through Progress.');
  if(!saved.includes('ACTIVE MISSION')||!saved.includes('activeCard'))failures.push('Saved must visibly distinguish its active mission restroom.');
  if(!location.includes('readTrustMission')||!location.includes('missionEvidenceRequirement')||!location.includes('activeMission.locationId===locationId'))failures.push('Location mission mode must bind the route request to the authoritative active mission location.');
  if(!location.includes('MISSION CONTEXT CHECK')||!location.includes('This restroom cannot replace it silently.')||!location.includes("router.push('/progress')"))failures.push('Location must expose stale or mismatched mission context without replacing the active mission and route recovery through Progress.');
  if(!location.includes('FULL EVIDENCE GOAL')||!location.includes('A verified review completes the mission; satisfying this evidence goal earns the full mission bonus.'))failures.push('Location must explain the server-derived full evidence goal and tiered reward semantics.');
  if(!location.includes('const completed=missionMatches?await completeTrustMission(locationId):null'))failures.push('Location may complete a mission only when the current restroom matches the authoritative active mission.');
  if(/grant\s+(select|insert|update|delete).*authenticated/i.test(base))failures.push('Authenticated clients must not receive direct trust mission table mutation authority.');
}
if(failures.length){console.error('Native trust mission platform audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native trust mission platform audit passed.');
