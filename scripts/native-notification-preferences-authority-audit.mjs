import fs from 'node:fs';
const required=[
  'apps/consumer-mobile/services/notificationPreferences.ts',
  'apps/consumer-mobile/app/notifications.tsx',
  'apps/consumer-mobile/services/push.ts',
  'supabase/migrations/20260831044500_mobile_notification_preferences_authority.sql',
  'supabase/migrations/20260831045500_notification_category_preference_enforcement.sql',
  'supabase/migrations/20260905165500_notification_preferences_v2_contract.sql',
];
const failures=[];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing notification preference authority file: ${file}`);
if(!failures.length){
  const service=fs.readFileSync(required[0],'utf8');
  const screen=fs.readFileSync(required[1],'utf8');
  const push=fs.readFileSync(required[2],'utf8');
  const base=fs.readFileSync(required[3],'utf8');
  const enforcement=fs.readFileSync(required[4],'utf8');
  const v2=fs.readFileSync(required[5],'utf8');

  for(const token of [
    "rpc('get_my_notification_preferences_v2'",
    "rpc('update_my_notification_preferences_v2'",
    'p_platform_updates','p_progression','p_offers','p_sponsored','p_location_alerts','p_social',
    'p_personalized_ads','p_location_based_offers','p_quiet_hours_start','p_quiet_hours_end',
    'ads_personalization_consent_at','location_offers_consent_at',
  ])if(!service.includes(token))failures.push(`Mobile notification preference service missing v2 authority token: ${token}`);

  for(const token of [
    "['push','Native push'",
    "['platform_updates','Platform updates'",
    "['community','Community'",
    "['social','Social activity'",
    "['rewards','Rewards'",
    "['progression','Progression'",
    "['intelligence','Kleenest intelligence'",
    "['location_alerts','Nearby utility alerts'",
    "['offers','Offers & incentives'",
    "['sponsored','Sponsored messages'",
    "['personalized_ads','Personalized sponsored messages'",
    "['location_based_offers','Location-based sponsored offers'",
    'getNotificationPreferenceStatus','updateNotificationPreferences',
    'updateNotificationPreferences({push:true})',
    'registerNativePush()','unregisterNativePush()',
    'What reaches you','SPONSORED & PERSONALIZATION',
  ])if(!screen.includes(token))failures.push(`Notification center missing v2 preference UX token: ${token}`);

  if(!screen.includes("if(key==='sponsored'&&!value){patch.personalized_ads=false;patch.location_based_offers=false}"))failures.push('Sponsored opt-out must also disable dependent sponsored-personalization preferences.');
  if(!screen.includes("if((key==='personalized_ads'||key==='location_based_offers')&&value)patch.sponsored=true"))failures.push('Sponsored personalization/location opt-ins must establish sponsored consent first.');
  if(!push.includes("rpc('register_notification_native_push_token'"))failures.push('Native push registration must remain on canonical token authority.');

  for(const token of ['public.get_my_notification_preferences','public.update_my_notification_preferences',"set search_path = ''",'public.notification_preferences','np.push','public.notification_native_push_tokens','net.http_post'])if(!base.includes(token))failures.push(`Notification preference base migration missing authority token: ${token}`);
  if(!base.includes('coalesce((select np.push from public.notification_preferences np where np.user_id=new.user_id),true)'))failures.push('Push enqueue authority must honor the user push preference before worker invocation.');
  if(!base.includes('revoke all on function public.get_my_notification_preferences() from public,anon')||!base.includes('grant execute on function public.get_my_notification_preferences() to authenticated'))failures.push('Base notification preference reads must be authenticated-only.');
  if(!base.includes('revoke all on function public.update_my_notification_preferences(boolean,boolean,boolean,boolean) from public,anon')||!base.includes('grant execute on function public.update_my_notification_preferences(boolean,boolean,boolean,boolean) to authenticated'))failures.push('Base notification preference writes must be authenticated-only.');
  if(!base.includes('revoke all on function public.enqueue_notification_native_push_delivery() from public,anon,authenticated'))failures.push('Push enqueue trigger authority must remain unavailable to app roles.');

  for(const token of [
    'public.get_my_notification_preferences_v2','public.update_my_notification_preferences_v2',"set search_path = ''",
    'platform_updates boolean not null default true','progression boolean not null default true','offers boolean not null default true',
    'sponsored boolean not null default false','personalized_ads boolean not null default false','location_based_offers boolean not null default false',
    'ads_personalization_consent_at','location_offers_consent_at',
    'revoke all on function public.get_my_notification_preferences_v2() from public, anon',
    'grant execute on function public.get_my_notification_preferences_v2() to authenticated, service_role',
    'revoke all on function public.update_my_notification_preferences_v2',
    'grant execute on function public.update_my_notification_preferences_v2',
  ])if(!v2.includes(token))failures.push(`Notification preference v2 migration missing authority token: ${token}`);

  for(const token of ['internal.enforce_notification_preferences','internal.notification_preference_suppressions',"set search_path = ''","'community'","'rewards'","'intelligence'",'notifications_enforce_preferences','before insert on public.notifications'])if(!enforcement.includes(token))failures.push(`Notification category enforcement missing token: ${token}`);
  for(const token of ["'new_follower'","'review_helpful'","'business_review_reply'","v_type='game_challenge'","v_type like 'badge%'","v_type like 'quest%'","'trusted_place'","'popular_place'","'operational_attention'","'demand_opportunity'","'high_activity_zone'"])if(!enforcement.includes(token))failures.push(`Notification category map missing token: ${token}`);
  if(!enforcement.includes('return null;')||!enforcement.includes('insert into internal.notification_preference_suppressions'))failures.push('Suppressed preference categories must be blocked before insert and recorded internally.');
  if(!enforcement.includes('revoke all on function internal.enforce_notification_preferences() from public,anon,authenticated')||!enforcement.includes('revoke all on table internal.notification_preference_suppressions from public,anon,authenticated'))failures.push('Preference suppression authority and telemetry must remain internal-only.');
  if(enforcement.includes("'support_status'"))failures.push('Support status notifications must remain outside optional category suppression.');
}
if(failures.length){console.error('Native notification preference authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native notification preference v2 authority audit passed.');
