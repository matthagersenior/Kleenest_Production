drop policy if exists "business_campaigns_member_select" on public.business_campaigns;

alter policy "business_certifications_public_select" on public.business_certifications to anon using (status = 'active'::text);
alter policy "business_certifications_member_select" on public.business_certifications using ((status = 'active'::text) or exists (select 1 from public.business_members bm where bm.business_id = business_certifications.business_id and bm.user_id = (select auth.uid())));

alter policy "businesses_public_select" on public.businesses to anon using (verification_status = 'verified'::verification_status);
alter policy "businesses_platform_owner_select" on public.businesses using ((verification_status = 'verified'::verification_status) or is_platform_owner_session());

alter policy "business members read visits for their locations" on public.location_visits using ((user_id = (select auth.uid())) or exists (select 1 from public.locations l join public.business_members bm on bm.business_id = l.business_id where l.id = location_visits.location_id and bm.user_id = (select auth.uid())));
drop policy if exists "users read own visits" on public.location_visits;

alter policy "business owners read preferred activations for their locations" on public.preferred_location_activations using ((user_id = (select auth.uid())) or exists (select 1 from public.locations l join public.business_members bm on bm.business_id = l.business_id where l.id = preferred_location_activations.location_id and bm.user_id = (select auth.uid())));
drop policy if exists "users read own preferred activations" on public.preferred_location_activations;

alter policy "reports_approved_public_select" on public.reports to anon using (status = any (array['approved'::report_status,'added'::report_status]));
alter policy "reports_own_select" on public.reports using ((reporter_id = (select auth.uid())) or (status = any (array['approved'::report_status,'added'::report_status])));

alter policy "subscriptions_business_member_select" on public.subscriptions using ((user_id = (select auth.uid())) or exists (select 1 from public.business_members bm where bm.business_id = subscriptions.business_id and bm.user_id = (select auth.uid()) and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role,'manager'::business_member_role])));
drop policy if exists "subscriptions_own_select" on public.subscriptions;

alter policy "feedback_admin_select" on public.user_feedback using ((user_id = (select auth.uid())) or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'::account_role));
drop policy if exists "feedback_select_own" on public.user_feedback;
