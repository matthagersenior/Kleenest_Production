
alter policy "Users can remove their blocks" on public.user_blocks
  using (blocker_id = (select auth.uid()));

alter policy "Users can view their blocks" on public.user_blocks
  using (blocker_id = (select auth.uid()));

alter policy "Users can create their blocks" on public.user_blocks
  with check (
    blocker_id = (select auth.uid())
    and blocked_id <> (select auth.uid())
  );

alter policy "Users can view reports they submitted" on public.user_safety_reports
  using (reporter_id = (select auth.uid()));

alter policy "Users can submit safety reports" on public.user_safety_reports
  with check (
    reporter_id = (select auth.uid())
    and reported_user_id <> (select auth.uid())
  );

alter policy reporting_schedules_owner_insert on public.reporting_schedules
  with check (
    owner_id = (select auth.uid())
    and public.reporting_schedule_scope_authorized(owner_id, scope_type, scope_id)
  );

alter policy "Users can view their policy acceptance" on public.policy_acceptances
  using (user_id = (select auth.uid()));

alter policy game_content_exposures_owner_read on public.game_content_exposures
  using ((select auth.uid()) = user_id);

alter policy fleet_monitored_locations_observe on public.fleet_monitored_locations
  using (
    public.fleet_observe_access(business_id)
    or public.is_platform_owner((select auth.uid()))
  );

drop policy if exists fleet_premium_memberships_self_read on public.fleet_premium_memberships;
drop policy if exists fleet_premium_memberships_manager_read on public.fleet_premium_memberships;
drop policy if exists fleet_premium_memberships_read on public.fleet_premium_memberships;

create policy fleet_premium_memberships_read
  on public.fleet_premium_memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.fleet_actor_is_manager(business_id)
    or public.is_platform_owner((select auth.uid()))
  );
