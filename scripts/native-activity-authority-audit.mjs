import fs from 'node:fs';
const required=['apps/consumer-mobile/services/activity.ts','apps/consumer-mobile/services/communityActivity.ts','apps/consumer-mobile/app/activity.tsx','apps/consumer-mobile/app/social.tsx','supabase/migrations/20260831043000_mobile_my_activity_feed_authority.sql'];
const failures=[];for(const file of required)if(!fs.existsSync(file))failures.push(`missing activity authority file: ${file}`);
if(!failures.length){
  const service=fs.readFileSync(required[0],'utf8');
  const networkService=fs.readFileSync(required[1],'utf8');
  const screen=fs.readFileSync(required[2],'utf8');
  const community=fs.readFileSync(required[3],'utf8');
  const migration=fs.readFileSync(required[4],'utf8');
  if(!service.includes("rpc('my_activity_feed'")||service.includes("from('social_activity')"))failures.push('Personal activity must use the canonical private activity RPC and never read social_activity directly.');
  if(!screen.includes('listMyActivity')||!screen.includes('listMobileCommunityActivity')||!screen.includes("type Mode='You'|'Network'"))failures.push('Activity UI must keep personal and network activity as explicit separate surfaces.');
  if(!screen.includes('Your private history stays separate')||!screen.includes('VISIT EVIDENCE')||!screen.includes('✓ VERIFIED'))failures.push('Activity UI must explain the privacy boundary and preserve verified evidence context.');
  if(!networkService.includes("rpc('community_following_review_activity'")||!networkService.includes('verified_checked_in_at')||!networkService.includes('amenity_evidence_count'))failures.push('Network activity must remain backed by the canonical followed-review evidence RPC.');
  if(!community.includes('Followers')||!community.includes('Follow back')||!community.includes('MUTUAL')||!community.includes('<TrustLine person={person}/>'))failures.push('Community must give followers trust parity and explicit follow-back/mutual state.');
  for(const token of ['public.my_activity_feed','security definer',"set search_path = ''",'public.check_ins','public.reviews','public.social_activity','ci.user_id']){if(token==='ci.user_id')continue;if(!migration.includes(token))failures.push(`Activity migration missing authority token: ${token}`)}
  if(!migration.includes('ci.user_id')&&!migration.includes('ci.user_id')){}
  if(!migration.includes('ci.user_id')&&(!migration.includes('ci.user_id'))){}
  if(!migration.includes('where ci.user_id=v_user')||!migration.includes('where r.user_id=v_user')||!migration.includes('sa.user_id=v_user or sa.actor_user_id=v_user'))failures.push('Personal activity authority must scope every source to the authenticated user.');
  if(!migration.includes('revoke all on function public.my_activity_feed(integer) from public, anon')||!migration.includes('grant execute on function public.my_activity_feed(integer) to authenticated'))failures.push('Personal activity RPC must be authenticated-only.');
  if(!migration.includes('revoke select, references, trigger on table public.social_activity from anon'))failures.push('Anonymous direct social_activity table privileges must remain removed.');
}
if(failures.length){console.error('Native activity authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}console.log('Native activity authority audit passed.');
