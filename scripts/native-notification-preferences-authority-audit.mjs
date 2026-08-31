import fs from 'node:fs';
const required=['apps/consumer-mobile/services/notificationPreferences.ts','apps/consumer-mobile/app/notifications.tsx','apps/consumer-mobile/services/push.ts','supabase/migrations/20260831044500_mobile_notification_preferences_authority.sql','supabase/migrations/20260831045500_notification_category_preference_enforcement.sql'];
const failures=[];for(const file of required)if(!fs.existsSync(file))failures.push(`missing notification preference authority file: ${file}`);
if(!failures.length){
  const service=fs.readFileSync(required[0],'utf8');
  const screen=fs.readFileSync(required[1],'utf8');
  const push=fs.readFileSync(required[2],'utf8');
  const migration=fs.readFileSync(required[3],'utf8');
  const enforcement=fs.readFileSync(required[4],'utf8');
  if(!service.includes("rpc('get_my_notification_preferences'")||!service.includes("rpc('update_my_notification_preferences'"))failures.push('Mobile notification preferences must use canonical authenticated RPCs.');
  for(const token of ["['push','Native push'","['community','Community'","['rewards','Rewards & progress'","['intelligence','Kleenest intelligence'",'updateNotificationPreferences({push:true})','Turning native push off stops delivery before the push worker is invoked.'])if(!screen.includes(token))failures.push(`Notification center missing preference UX token: ${token}`);
  if(!push.includes("rpc('register_notification_native_push_token'"))failures.push('Native push registration must remain on canonical token authority.');
  for(const token of ['public.get_my_notification_preferences','public.update_my_notification_preferences',"set search_path = ''",'public.notification_preferences','np.push','public.notification_native_push_tokens','net.http_post'])if(!migration.includes(token))failures.push(`Notification preference migration missing authority token: ${token}`);
  if(!migration.includes('coalesce((select np.push from public.notification_preferences np where np.user_id=new.user_id),true)'))failures.push('Push enqueue authority must honor the user push preference before worker invocation.');
  if(!migration.includes('revoke all on function public.get_my_notification_preferences() from public,anon')||!migration.includes('grant execute on function public.get_my_notification_preferences() to authenticated'))failures.push('Notification preference reads must be authenticated-only.');
  if(!migration.includes('revoke all on function public.update_my_notification_preferences(boolean,boolean,boolean,boolean) from public,anon')||!migration.includes('grant execute on function public.update_my_notification_preferences(boolean,boolean,boolean,boolean) to authenticated'))failures.push('Notification preference writes must be authenticated-only.');
  if(!migration.includes('revoke all on function public.enqueue_notification_native_push_delivery() from public,anon,authenticated'))failures.push('Push enqueue trigger authority must remain unavailable to app roles.');
  for(const token of ['internal.enforce_notification_preferences','internal.notification_preference_suppressions',"set search_path = ''","'community'","'rewards'","'intelligence'",'notifications_enforce_preferences','before insert on public.notifications'])if(!enforcement.includes(token))failures.push(`Notification category enforcement missing token: ${token}`);
  for(const token of ["'new_follower'","'review_helpful'","'business_review_reply'","v_type='game_challenge'","v_type like 'badge%'","v_type like 'quest%'","'trusted_place'","'popular_place'","'operational_attention'","'demand_opportunity'","'high_activity_zone'"])if(!enforcement.includes(token))failures.push(`Notification category map missing token: ${token}`);
  if(!enforcement.includes('return null;')||!enforcement.includes('insert into internal.notification_preference_suppressions'))failures.push('Suppressed preference categories must be blocked before insert and recorded internally.');
  if(!enforcement.includes('revoke all on function internal.enforce_notification_preferences() from public,anon,authenticated')||!enforcement.includes('revoke all on table internal.notification_preference_suppressions from public,anon,authenticated'))failures.push('Preference suppression authority and telemetry must remain internal-only.');
  if(enforcement.includes("'support_status'"))failures.push('Support status notifications must remain outside optional category suppression.');
}
if(failures.length){console.error('Native notification preference authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}console.log('Native notification preference authority audit passed.');
