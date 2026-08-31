import fs from 'node:fs';

const required=[
  'supabase/migrations/20260831073000_mobile_notification_support_rls_initplan_hardening.sql',
  'supabase/migrations/20260831073500_mobile_core_hotpath_rls_convergence.sql',
  'supabase/migrations/20260831074000_mobile_hotpath_duplicate_index_cleanup.sql',
  'supabase/migrations/20260831075000_mobile_secondary_hotpath_rls_and_streak_authority_hardening.sql',
];
const failures=[];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing hot-path authority migration: ${file}`);
if(!failures.length){
  const support=fs.readFileSync(required[0],'utf8');
  const core=fs.readFileSync(required[1],'utf8');
  const indexes=fs.readFileSync(required[2],'utf8');
  const secondary=fs.readFileSync(required[3],'utf8');
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
  const coreUnsafe=(core.match(/auth\.uid\(\)/g)||[]).length;
  const coreSafe=(core.match(/\(select auth\.uid\(\)\)/g)||[]).length;
  if(coreUnsafe!==coreSafe)failures.push('all auth.uid() checks in mobile hot-path RLS migration must use init-plan-safe select form');
  for(const token of [
    'drop index if exists public.reviews_location_idx',
    'drop index if exists public.idx_locations_geo_lookup',
    'drop index if exists public.qr_codes_business_idx',
    'drop index if exists public.route_stops_route_order_unique',
    'route_stops_route_id_stop_order_key',
  ])if(!indexes.includes(token))failures.push(`mobile hot-path index cleanup missing token: ${token}`);
  if(indexes.includes('drop index if exists public.route_stops_route_id_stop_order_key'))failures.push('constraint-backed route stop unique index must never be dropped');
  for(const token of [
    'location_amenity_observations_insert_own',
    'kleenest_location_favorites_owner',
    'support_requests_select_own',
    'user_badges_select',
    'reward_transactions_select_own',
    'verification_streaks_select_own',
    'route_plans_owner',
    'route_stops_owner',
    'route_events_owner',
    'route_events_owner_insert',
    'revoke insert, update, delete, truncate on table public.verification_streaks from authenticated',
    "alter function public.record_verification_streak(uuid) set search_path = ''",
    'revoke all on function public.record_verification_streak(uuid) from public, anon, authenticated',
    'grant execute on function public.record_verification_streak(uuid) to service_role',
  ])if(!secondary.includes(token))failures.push(`secondary mobile hot-path hardening missing token: ${token}`);
  const secondaryUnsafe=(secondary.match(/auth\.uid\(\)/g)||[]).length;
  const secondarySafe=(secondary.match(/\(select auth\.uid\(\)\)/g)||[]).length;
  if(secondaryUnsafe!==secondarySafe)failures.push('all auth.uid() checks in secondary mobile hot-path migration must use init-plan-safe select form');
}
if(failures.length){console.error('Native hot-path RLS authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native hot-path RLS authority audit passed.');
