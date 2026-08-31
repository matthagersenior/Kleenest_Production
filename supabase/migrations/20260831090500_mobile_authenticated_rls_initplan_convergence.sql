alter policy "account_service_entitlements_own" on public.account_service_entitlements using (account_user_id = (select auth.uid()));

alter policy "data_feature_events_insert_own" on public.data_feature_events with check ((actor_user_id is null) or (actor_user_id = (select auth.uid())));
alter policy "data_feature_events_select_own" on public.data_feature_events using (actor_user_id = (select auth.uid()));

alter policy "feature_access_events_own" on public.feature_access_events with check (user_id = (select auth.uid()));
alter policy "feature_access_events_select_own" on public.feature_access_events using (user_id = (select auth.uid()));

alter policy "business members read visits for their locations" on public.location_visits using (exists (select 1 from public.locations l join public.business_members bm on bm.business_id = l.business_id where l.id = location_visits.location_id and bm.user_id = (select auth.uid())));
alter policy "users read own visits" on public.location_visits using (user_id = (select auth.uid()));

alter policy "business owners read preferred activations for their locations" on public.preferred_location_activations using (exists (select 1 from public.locations l join public.business_members bm on bm.business_id = l.business_id where l.id = preferred_location_activations.location_id and bm.user_id = (select auth.uid())));
alter policy "users read own preferred activations" on public.preferred_location_activations using (user_id = (select auth.uid()));

alter policy "preferred_usage_events_owner_select" on public.preferred_usage_events using (user_id = (select auth.uid()));
alter policy "qr_attribution_read_own" on public.qr_attribution_events using (user_id = (select auth.uid()));
alter policy "kleenest_qr_redemptions_owner" on public.qr_redemptions using (user_id = (select auth.uid()));

alter policy "quest_participation_own_insert" on public.quest_participation with check (user_id = (select auth.uid()));
alter policy "quest_participation_own_read" on public.quest_participation using (user_id = (select auth.uid()));
alter policy "quest_step_events_own_insert" on public.quest_step_events with check (user_id = (select auth.uid()));
alter policy "quest_step_events_own_read" on public.quest_step_events using (user_id = (select auth.uid()));

alter policy "semantic_search_queries_own_insert" on public.semantic_search_queries with check (user_id = (select auth.uid()));
alter policy "semantic_search_queries_own_select" on public.semantic_search_queries using (user_id = (select auth.uid()));

alter policy "user_engagement_daily_own" on public.user_engagement_daily using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "user_feature_entitlements_self_read" on public.user_feature_entitlements using (user_id = (select auth.uid()));
alter policy "user_streaks_owner" on public.user_streaks using (user_id = (select auth.uid()));
