drop policy if exists kleenest_location_claims_access on public.location_claims;
create policy kleenest_location_claims_access on public.location_claims for select to authenticated using (claimed_by = (select auth.uid()) or public.business_can_manage(business_id));

drop policy if exists kleenest_location_submissions_owner on public.location_submissions;
create policy kleenest_location_submissions_owner on public.location_submissions for select to authenticated using (submitted_by = (select auth.uid()) or (claimed_business_id is not null and public.business_can_manage(claimed_business_id)));

drop policy if exists location_quality_observations_insert_own on public.location_quality_observations;
create policy location_quality_observations_insert_own on public.location_quality_observations for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists location_observation_votes_own on public.location_observation_votes;
create policy location_observation_votes_own on public.location_observation_votes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists review_amenity_feedback_authenticated_read on public.review_amenity_feedback;
create policy review_amenity_feedback_authenticated_read on public.review_amenity_feedback for select to authenticated using ((select auth.uid()) is not null);