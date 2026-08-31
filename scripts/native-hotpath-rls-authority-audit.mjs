import fs from 'node:fs';

const required=[
  'supabase/migrations/20260831073000_mobile_notification_support_rls_initplan_hardening.sql',
  'supabase/migrations/20260831073500_mobile_core_hotpath_rls_convergence.sql',
];
const failures=[];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing hot-path RLS migration: ${file}`);
if(!failures.length){
  const support=fs.readFileSync(required[0],'utf8');
  const core=fs.readFileSync(required[1],'utf8');
  for(const token of [
    'notification_deliveries_own_read',
    'recipient_user_id = (select auth.uid())',
    'notification_events_authenticated_read',
    'actor_user_id = (select auth.uid())',
  ])if(!support.includes(token))failures.push(`notification support RLS migration missing token: ${token}`);
  for(const token of [
    'reviews_public_or_own_select',
    "status = 'published'::public.review_status or user_id = (select auth.uid())",
    'reviews_own_insert',
    'reviews_own_update',
    'reviews_own_delete',
    'checkins_own_select',
    'checkins_own_insert',
    'verification_points_own_select',
    'point_transactions_own_select',
    'follows_read_connected',
    'follows_own_insert',
    'follows_own_update',
    'follows_own_delete',
  ])if(!core.includes(token))failures.push(`mobile hot-path RLS migration missing token: ${token}`);
  for(const legacy of [
    '"published reviews are public"',
    '"users create their own reviews"',
    '"users update their own reviews"',
    '"users delete their own reviews"',
    '"users read their own checkins"',
    '"users create their own checkins"',
    '"users read own verification points"',
    '"users read own point transactions"',
    'follows_own_all',
  ])if(!core.includes(`drop policy if exists ${legacy}`))failures.push(`mobile hot-path RLS migration must explicitly retire legacy policy: ${legacy}`);
  const unsafe=(core.match(/auth\.uid\(\)/g)||[]).length;
  const safe=(core.match(/\(select auth\.uid\(\)\)/g)||[]).length;
  if(unsafe!==safe)failures.push('all auth.uid() checks in mobile hot-path RLS migration must use init-plan-safe select form');
}
if(failures.length){console.error('Native hot-path RLS authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native hot-path RLS authority audit passed.');
