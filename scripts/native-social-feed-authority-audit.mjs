import fs from 'node:fs';

const migration='supabase/migrations/20260831082000_mobile_social_feed_rls_and_index_convergence.sql';
const failures=[];
if(!fs.existsSync(migration))failures.push(`missing social feed authority migration: ${migration}`);
else{
  const sql=fs.readFileSync(migration,'utf8');
  for(const token of [
    'drop policy if exists social_posts_own_all',
    'social_posts_insert_own','social_posts_update_own','social_posts_delete_own',
    'drop policy if exists social_post_comments_own_all',
    'social_post_comments_insert_own','social_post_comments_update_own','social_post_comments_delete_own',
    'drop policy if exists social_post_likes_own_all',
    'social_post_likes_insert_own','social_post_likes_update_own','social_post_likes_delete_own',
    'drop policy if exists social_post_saves_own_all',
    'social_post_saves_select_own','social_post_saves_insert_own','social_post_saves_update_own','social_post_saves_delete_own',
    'social_reports_own_insert','social_reports_own_read',
    'social_challenge_entries_own_delete','social_challenge_entries_own_read',
    'drop index if exists public.social_posts_user_idx',
    'alter table public.social_challenge_entries drop constraint if exists social_challenge_entries_challenge_user_key',
    'drop index if exists public.social_challenge_entries_challenge_idx'
  ])if(!sql.includes(token))failures.push(`social feed migration missing token: ${token}`);
  const unsafe=(sql.match(/auth\.uid\(\)/g)||[]).length;
  const safe=(sql.match(/\(select auth\.uid\(\)\)/g)||[]).length;
  if(unsafe!==safe)failures.push('all auth.uid() checks in social feed migration must use init-plan-safe select form');
  for(const forbidden of ['create policy social_posts_own_all','create policy social_post_comments_own_all','create policy social_post_likes_own_all'])if(sql.includes(forbidden))failures.push(`social feed migration must not recreate overlapping ALL policy: ${forbidden}`);
  if(sql.includes('drop index if exists public.social_posts_user_created_at_idx'))failures.push('canonical social post user/created index must be preserved');
  if(sql.includes('drop constraint if exists social_challenge_entries_pkey'))failures.push('social challenge composite primary key must be preserved');
}
if(failures.length){console.error('Native social feed authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native social feed authority audit passed.');
