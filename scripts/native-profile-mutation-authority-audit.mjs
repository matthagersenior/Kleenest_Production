import fs from 'node:fs';

const required=[
  'apps/consumer-mobile/app/profile.tsx',
  'apps/consumer-mobile/services/avatar.ts',
  'supabase/migrations/20260831062000_mobile_public_profile_mutation_authority.sql',
  'supabase/migrations/20260831062500_mobile_profile_bootstrap_authority_hardening.sql',
];
const failures=[];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing profile mutation authority file: ${file}`);
if(!failures.length){
  const profile=fs.readFileSync(required[0],'utf8');
  const avatar=fs.readFileSync(required[1],'utf8');
  const mutation=fs.readFileSync(required[2],'utf8');
  const bootstrap=fs.readFileSync(required[3],'utf8');

  if(!profile.includes("rpc('update_my_public_profile'")||profile.includes("from('profiles').update")) failures.push('Public profile edits must use the constrained profile RPC and never direct table UPDATE.');
  if(!avatar.includes("rpc('update_my_public_avatar'")||avatar.includes(".from('profiles')")) failures.push('Avatar identity mutation must use the constrained avatar RPC and never direct profile-table UPDATE.');
  if(!avatar.includes("storage.from('avatars').upload")||!avatar.includes('`${user.id}/avatar-')||!avatar.includes('MAX_AVATAR_BYTES')) failures.push('Avatar upload must remain user-folder scoped and size bounded.');

  for(const token of ['public.update_my_public_profile','public.update_my_public_avatar','security definer',"set search_path = ''",'pg_catalog.length','revoke update on table public.profiles from authenticated']) if(!mutation.toLowerCase().includes(token.toLowerCase())) failures.push(`Profile mutation migration missing authority token: ${token}`);
  for(const forbidden of ['subscription_tier=','role=','is_admin=','is_platform_owner=','points=','level=','streak=','total_check_ins=','total_reviews=']) if(mutation.toLowerCase().includes(forbidden.toLowerCase())) failures.push(`Public profile mutation must not write protected field: ${forbidden}`);
  if(!mutation.includes('revoke all on function public.update_my_public_profile(text,text,text) from public, anon')||!mutation.includes('grant execute on function public.update_my_public_profile(text,text,text) to authenticated')) failures.push('Public profile RPC must be authenticated-only.');
  if(!mutation.includes('revoke all on function public.update_my_public_avatar(text) from public, anon')||!mutation.includes('grant execute on function public.update_my_public_avatar(text) to authenticated')) failures.push('Public avatar RPC must be authenticated-only.');

  for(const token of ['public.ensure_current_user_profile','public.ensure_signup_profile','public.handle_new_user',"set search_path = ''",'revoke insert on table public.profiles from authenticated']) if(!bootstrap.toLowerCase().includes(token.toLowerCase())) failures.push(`Profile bootstrap migration missing authority token: ${token}`);
  if(!bootstrap.includes('revoke all on function public.ensure_signup_profile(text,text,text,text,boolean) from public,anon,authenticated')) failures.push('Legacy signup-profile authority must remain unavailable to ordinary clients.');
  if(!bootstrap.includes('revoke all on function public.handle_new_user() from public,anon,authenticated')) failures.push('Auth trigger function must not be directly client executable.');
  if(!bootstrap.includes('grant execute on function public.ensure_current_user_profile() to authenticated')) failures.push('Authenticated self-profile repair authority must remain available.');
}
if(failures.length){console.error('Native profile mutation authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native profile mutation authority audit passed.');
