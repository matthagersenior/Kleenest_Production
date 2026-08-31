import fs from 'node:fs';
const failures=[];
const required=[
  'apps/consumer-mobile/services/trustMissions.ts',
  'apps/consumer-mobile/services/activity.ts',
  'apps/consumer-mobile/app/play.tsx',
  'apps/consumer-mobile/services/notificationRouting.ts',
  'supabase/migrations/20260831082000_mobile_trust_mission_platform_authority.sql',
  'supabase/migrations/20260831082500_mobile_trust_mission_tiered_rewards.sql'
];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing trust mission platform file: ${file}`);
if(!failures.length){
  const read=file=>fs.readFileSync(file,'utf8');
  const service=read(required[0]),activity=read(required[1]),play=read(required[2]),routing=read(required[3]),base=read(required[4]),tiered=read(required[5]);
  for(const rpc of ['start_my_trust_mission','my_trust_mission','my_trust_mission_history','complete_my_trust_mission','cancel_my_trust_mission'])if(!service.includes(rpc))failures.push(`mobile trust mission service missing RPC: ${rpc}`);
  if(!service.includes("getKleenestSupabaseClient")||!service.includes("SecureStore" )||!service.includes('offlineMirror'))failures.push('Trust mission service must use server authority with SecureStore only as an offline mirror.');
  if(!service.includes("client.from('reviews')")||!service.includes(".not('check_in_id','is',null)"))failures.push('Mission completion must resolve a published verified review before calling server completion authority.');
  for(const token of ['create table if not exists public.user_trust_missions','user_trust_missions_one_active_idx','enable row level security','revoke all on table public.user_trust_missions from public, anon, authenticated'])if(!base.includes(token))failures.push(`Base mission authority missing: ${token}`);
  for(const fn of ['start_my_trust_mission','my_trust_mission','my_trust_mission_history','cancel_my_trust_mission','complete_my_trust_mission']){
    if(!base.includes(`function public.${fn}`))failures.push(`Base mission migration missing function ${fn}`);
  }
  if(!base.includes("set search_path=''"))failures.push('Mission RPCs must be hardened with an empty search path.');
  if(!tiered.includes("trust_mission_visit_bonus")||!tiered.includes("v_goal_satisfied")||!tiered.includes("case when v_goal_satisfied then 'trust_mission_bonus' else 'trust_mission_visit_bonus' end"))failures.push('Tiered mission rewards must distinguish full evidence goals from verified-visit completion.');
  if(!tiered.includes("'trust_mission_completed','trust_mission'")||!tiered.includes("quest_dispatch_event")||!tiered.includes("'trust_mission_completed'"))failures.push('Mission completion must converge progression metrics, quests, and activity.');
  if(!tiered.includes("'progress_trust_mission_completed'")||!tiered.includes("'goal_satisfied',v_goal_satisfied"))failures.push('Mission completion notification must preserve progress routing and goal-satisfaction context.');
  if(!activity.includes("activityType==='trust_mission_completed'")||!activity.includes("Completed a trust mission")||!activity.includes('bonus points'))failures.push('Personal Activity must present mission completion explicitly.');
  if(!play.includes('listTrustMissionHistory')||!play.includes('completedTrustMissions')||!play.includes('Active trust mission'))failures.push('Play must surface authoritative active mission state and completion history.');
  if(!routing.includes("type.includes('progress')")||!routing.includes("return'/play'"))failures.push('Progress notifications must route to Play.');
  if(/grant\s+(select|insert|update|delete).*authenticated/i.test(base))failures.push('Authenticated clients must not receive direct trust mission table mutation authority.');
}
if(failures.length){console.error('Native trust mission platform audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native trust mission platform audit passed.');
