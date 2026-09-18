-- Harden business membership visibility: the previous policy compared bm.business_id to itself.
drop policy if exists business_members_self_select on public.business_members;
create policy business_members_self_select
on public.business_members
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.business_members viewer
    where viewer.business_id = business_members.business_id
      and viewer.user_id = (select auth.uid())
      and viewer.role = any (array['owner'::business_member_role,'admin'::business_member_role,'manager'::business_member_role])
  )
);

-- Subscriptions: users can see/manage their own user subscriptions; business owners/admins/managers can see/manage business subscriptions.
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_own_select on public.subscriptions;
drop policy if exists subscriptions_business_member_select on public.subscriptions;
drop policy if exists subscriptions_own_insert on public.subscriptions;
drop policy if exists subscriptions_business_member_insert on public.subscriptions;
drop policy if exists subscriptions_own_update on public.subscriptions;
drop policy if exists subscriptions_business_member_update on public.subscriptions;
drop policy if exists subscriptions_own_delete on public.subscriptions;
drop policy if exists subscriptions_business_member_delete on public.subscriptions;
create policy subscriptions_own_select on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy subscriptions_business_member_select on public.subscriptions for select to authenticated using (exists (select 1 from public.business_members bm where bm.business_id = subscriptions.business_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role,'manager'::business_member_role])));
create policy subscriptions_own_insert on public.subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy subscriptions_business_member_insert on public.subscriptions for insert to authenticated with check (exists (select 1 from public.business_members bm where bm.business_id = subscriptions.business_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role])));
create policy subscriptions_own_update on public.subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy subscriptions_business_member_update on public.subscriptions for update to authenticated using (exists (select 1 from public.business_members bm where bm.business_id = subscriptions.business_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role]))) with check (exists (select 1 from public.business_members bm where bm.business_id = subscriptions.business_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role])));

-- Partner agreements: only members of either participating business may view; privileged members may modify.
alter table public.partner_agreements enable row level security;
drop policy if exists partner_agreements_member_select on public.partner_agreements;
drop policy if exists partner_agreements_member_insert on public.partner_agreements;
drop policy if exists partner_agreements_member_update on public.partner_agreements;
drop policy if exists partner_agreements_member_delete on public.partner_agreements;
create policy partner_agreements_member_select on public.partner_agreements for select to authenticated using (
  exists (select 1 from public.partner_programs pp join public.business_members bm on bm.business_id = pp.business_id where pp.id = partner_agreements.partner_program_id and bm.user_id = (select auth.uid()))
  or exists (select 1 from public.business_members bm where bm.business_id = partner_agreements.partner_business_id and bm.user_id = (select auth.uid()))
);
create policy partner_agreements_member_insert on public.partner_agreements for insert to authenticated with check (
  exists (select 1 from public.partner_programs pp join public.business_members bm on bm.business_id = pp.business_id where pp.id = partner_agreements.partner_program_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role,'manager'::business_member_role]))
);
create policy partner_agreements_member_update on public.partner_agreements for update to authenticated using (
  exists (select 1 from public.partner_programs pp join public.business_members bm on bm.business_id = pp.business_id where pp.id = partner_agreements.partner_program_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role,'manager'::business_member_role]))
  or exists (select 1 from public.business_members bm where bm.business_id = partner_agreements.partner_business_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role,'manager'::business_member_role]))
) with check (
  exists (select 1 from public.partner_programs pp join public.business_members bm on bm.business_id = pp.business_id where pp.id = partner_agreements.partner_program_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role,'manager'::business_member_role]))
  or exists (select 1 from public.business_members bm where bm.business_id = partner_agreements.partner_business_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role,'manager'::business_member_role]))
);
create policy partner_agreements_member_delete on public.partner_agreements for delete to authenticated using (
  exists (select 1 from public.partner_programs pp join public.business_members bm on bm.business_id = pp.business_id where pp.id = partner_agreements.partner_program_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role]))
);

-- Privileged trigger functions must not be callable as public API endpoints.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.notify_business_review() from public, anon, authenticated;
revoke execute on function public.notify_new_message() from public, anon, authenticated;
revoke execute on function public.process_check_in() from public, anon, authenticated;
revoke execute on function public.process_review_counter() from public, anon, authenticated;
revoke execute on function public.refresh_location_rating() from public, anon, authenticated;

-- Make application-facing views obey the caller's RLS policies.
alter view public.public_locations set (security_invoker = true);
alter view public.my_profile set (security_invoker = true);
alter view public.business_overview set (security_invoker = true);
alter view public.community_leaderboard set (security_invoker = true);
