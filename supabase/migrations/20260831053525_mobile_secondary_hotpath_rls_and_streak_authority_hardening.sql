-- Amenity observations: preserve authenticated public read, optimize self contribution check.
drop policy if exists location_amenity_observations_insert_own on public.location_amenity_observations;
create policy location_amenity_observations_insert_own on public.location_amenity_observations
for insert to authenticated
with check (user_id = (select auth.uid()));

-- Favorites, support, badges, rewards, streaks: init-plan-safe self reads.
drop policy if exists kleenest_location_favorites_owner on public.location_favorites;
create policy kleenest_location_favorites_owner on public.location_favorites
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists support_requests_select_own on public.support_requests;
create policy support_requests_select_own on public.support_requests
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists user_badges_select on public.user_badges;
create policy user_badges_select on public.user_badges
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists reward_transactions_select_own on public.reward_transactions;
create policy reward_transactions_select_own on public.reward_transactions
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists verification_streaks_select_own on public.verification_streaks;
create policy verification_streaks_select_own on public.verification_streaks
for select to authenticated
using (user_id = (select auth.uid()));

-- Route state: preserve owner semantics while avoiding per-row auth function evaluation.
drop policy if exists route_plans_owner on public.route_plans;
create policy route_plans_owner on public.route_plans
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists route_stops_owner on public.route_stops;
create policy route_stops_owner on public.route_stops
for all to authenticated
using (exists (select 1 from public.route_plans r where r.id = route_stops.route_id and r.user_id = (select auth.uid())))
with check (exists (select 1 from public.route_plans r where r.id = route_stops.route_id and r.user_id = (select auth.uid())));

drop policy if exists route_events_owner on public.route_events;
create policy route_events_owner on public.route_events
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists route_events_owner_insert on public.route_events;
create policy route_events_owner_insert on public.route_events
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.route_plans r where r.id = route_events.route_id and r.user_id = (select auth.uid()))
);

-- Verification streaks are server-owned progression state. Ordinary clients may read their own row only.
revoke insert, update, delete, truncate on table public.verification_streaks from authenticated;

-- Keep the existing service-only streak mutation function, but harden its execution environment.
alter function public.record_verification_streak(uuid) set search_path = '';
revoke all on function public.record_verification_streak(uuid) from public, anon, authenticated;
grant execute on function public.record_verification_streak(uuid) to service_role;
