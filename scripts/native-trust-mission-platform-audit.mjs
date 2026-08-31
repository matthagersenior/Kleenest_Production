import fs from 'node:fs';
const failures=[];
const required=[
  'apps/consumer-mobile/services/trustMissions.ts',
  'apps/consumer-mobile/services/activity.ts',
  'apps/consumer-mobile/app/play.tsx',
  'apps/consumer-mobile/services/notificationRouting.ts',
  'apps/consumer-mobile/app/explore.tsx',
  'apps/consumer-mobile/app/saved.tsx',
  'apps/consumer-mobile/app/location/[id].tsx',
  'supabase/migrations/20260831082000_mobile_trust_mission_platform_authority.sql',
  'supabase/migrations/20260831082500_mobile_trust_mission_tiered_rewards.sql'
];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing trust mission platform file: ${file}`);
if(!failures.length){
  const read=file=>fs.readFileSync(file,'utf8');
  const service=read(required[0]),activity=read(required[1]),play=read(required[2]),routing=read(required[3]),explore=read(required[4]),saved=read(required[5]),location=read(required[6]),base=read(required[7]),tiered=read(required[8]);
  for(const rpc of ['start_my_trust_mission','my_trust_mission','my_trust_mission_history','complete_my_trust_mission','cancel_my_trust_mission'])if(!service.includes(rpc))failures.push(`mobile trust mission service missing RPC: ${rpc}`);
  if(!service.includes("getKleenestSupabaseClient")||!service.includes('SecureStore')||!service.includes('offlineMirror'))failures.push('Trust mission service must use server authority with SecureStore only as an offline mirror.');
  if(!service.includes("client.from('reviews')")||!service.includes(".not('check_in_id','is',null)"))failures.push('Mission completion must resolve a published verified review before calling server completion authority.');
  if(!service.includes("TrustMissionAction='start'|'resume'|'active_elsewhere'")||!service.includes('trustMissionAction(active')||!service.includes("return active.locationId===locationId?'resume':'active_elsewhere'"))failures.push('Mission service must model start, resume, and active-elsewhere states explicitly.');
  if(!service.includes("if(active.locationId===locationId)return active")||!service.includes('Resume it or clear it from Play before starting another.'))failures.push('Mission service must preserve an active mission rather than silently replacing it.');
  for(const token of ['create table if not exists public.user_trust_missions','user_trust_missions_one_active_idx','enable row level security','revoke all on table public.user_trust_missions from public, anon, authenticated'])if(!base.includes(token))failures.push(`Base mission authority missing: ${token}`);
  for(const fn of ['start_my_trust_mission','my_trust_mission','my_trust_mission_history','cancel_my_trust_mission','complete_my_trust_mission'])if(!base.includes(`function public.${fn}`))failures.push(`Base mission migration missing function ${fn}`);
  if(!base.includes("set search_path=''"))failures.push('Mission RPCs must be hardened with an empty search path.');
  if(!tiered.includes('trust_mission_visit_bonus')||!tiered.includes('v_goal_satisfied')||!tiered.includes("case when v_goal_satisfied then 'trust_mission_bonus' else 'trust_mission_visit_bonus' end"))failures.push('Tiered mission rewards must distinguish full evidence goals from verified-visit completion.');
  if(!tiered.includes("'trust_mission_completed','trust_mission'")||!tiered.includes('quest_dispatch_event')||!tiered.includes("'trust_mission_completed'"))failures.push('Mission completion must converge progression metrics, quests, and activity.');
  if(!tiered.includes("'progress_trust_mission_completed'")||!tiered.includes("'goal_satisfied',v_goal_satisfied"))failures.push('Mission completion notification must preserve progress routing and goal-satisfaction context.');
  if(!activity.includes("activityType==='trust_mission_completed'")||!activity.includes('Completed a trust mission')||!activity.includes('bonus points'))failures.push('Personal Activity must present mission completion explicitly.');
  if(!play.includes('listTrustMissionHistory')||!play.includes('completedTrustMissions')||!play.includes('Active trust mission'))failures.push('Play must surface authoritative active mission state and completion history.');
  if(!routing.includes("type.includes('progress')")||!routing.includes("return'/play'"))failures.push('Progress notifications must route to Play.');
  for(const [name,screen] of [['Explore',explore],['Saved',saved]]){
    if(!screen.includes('readTrustMission')||!screen.includes('trustMissionAction'))failures.push(`${name} must load and evaluate the active trust mission.`);
    if(!screen.includes('Resume mission')||!screen.includes('View active mission')||!screen.includes('Resume active mission'))failures.push(`${name} must expose active/resume mission states clearly.`);
    if(!screen.includes("action==='active_elsewhere'")||!screen.includes("router.push('/play')"))failures.push(`${name} must preserve an active mission and route replacement decisions through Play.`);
  }
  if(!explore.includes('markerActive')||!explore.includes("{isActive?'A':isBest?'✓':isMission?'!':'WC'}"))failures.push('Explore map must distinguish the active mission from evidence and candidate mission markers.');
  if(!saved.includes('ACTIVE MISSION')||!saved.includes('activeCard'))failures.push('Saved must visibly distinguish its active mission restroom.');
  if(!location.includes('readTrustMission')||!location.includes('missionEvidenceRequirement')||!location.includes("activeMission.locationId===locationId"))failures.push('Location mission mode must bind the route request to the authoritative active mission location.');
  if(!location.includes('MISSION CONTEXT CHECK')||!location.includes('This restroom cannot replace it silently.')||!location.includes("router.push('/play')"))failures.push('Location must expose stale or mismatched mission context without replacing the active mission.');
  if(!location.includes('FULL EVIDENCE GOAL')||!location.includes('A verified review completes the mission; satisfying this evidence goal earns the full mission bonus.'))failures.push('Location must explain the server-derived full evidence goal and tiered reward semantics.');
  if(!location.includes("const completed=missionMatches?await completeTrustMission(locationId):null"))failures.push('Location may complete a mission only when the current restroom matches the authoritative active mission.');
  if(/grant\s+(select|insert|update|delete).*authenticated/i.test(base))failures.push('Authenticated clients must not receive direct trust mission table mutation authority.');
}
if(failures.length){console.error('Native trust mission platform audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native trust mission platform audit passed.');
