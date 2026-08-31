drop policy if exists location_filter_events_insert_authenticated on public.location_filter_events;
create policy location_filter_events_insert_authenticated on public.location_filter_events for insert to authenticated with check (user_id = (select auth.uid()) or user_id is null);
drop policy if exists location_filter_events_select_own on public.location_filter_events;
create policy location_filter_events_select_own on public.location_filter_events for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "users create their own restroom observations" on public.restroom_observations;
create policy "users create their own restroom observations" on public.restroom_observations for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "users update their own restroom observations" on public.restroom_observations;
create policy "users update their own restroom observations" on public.restroom_observations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists review_likes_write on public.review_likes;
create policy review_likes_insert_own on public.review_likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy review_likes_update_own on public.review_likes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy review_likes_delete_own on public.review_likes for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists review_reports_insert_own on public.review_reports;
create policy review_reports_insert_own on public.review_reports for insert to authenticated with check (reporter_id = (select auth.uid()));
drop policy if exists review_reports_select_own_or_admin on public.review_reports;
create policy review_reports_select_own_or_admin on public.review_reports for select to authenticated using (reporter_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));
revoke truncate on table public.review_reports from authenticated;

drop policy if exists geofence_events_own_insert on public.geofence_events;
create policy geofence_events_own_insert on public.geofence_events for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists geofence_events_own_read on public.geofence_events;
create policy geofence_events_own_read on public.geofence_events for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists user_location_sessions_delete_own on public.user_location_sessions;
create policy user_location_sessions_delete_own on public.user_location_sessions for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists user_location_sessions_insert_own on public.user_location_sessions;
create policy user_location_sessions_insert_own on public.user_location_sessions for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists user_location_sessions_select_own on public.user_location_sessions;
create policy user_location_sessions_select_own on public.user_location_sessions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists user_location_sessions_update_own on public.user_location_sessions;
create policy user_location_sessions_update_own on public.user_location_sessions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists route_discovery_sessions_owner on public.route_discovery_sessions;
create policy route_discovery_sessions_owner on public.route_discovery_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists route_discovery_cells_owner on public.route_discovery_cells;
create policy route_discovery_cells_owner on public.route_discovery_cells for all to authenticated using (exists (select 1 from public.route_discovery_sessions s where s.id = route_discovery_cells.session_id and s.user_id = (select auth.uid()))) with check (exists (select 1 from public.route_discovery_sessions s where s.id = route_discovery_cells.session_id and s.user_id = (select auth.uid())));
drop policy if exists route_discovery_locations_owner on public.route_discovery_locations;
create policy route_discovery_locations_owner on public.route_discovery_locations for all to authenticated using (exists (select 1 from public.route_discovery_sessions s where s.id = route_discovery_locations.session_id and s.user_id = (select auth.uid()))) with check (exists (select 1 from public.route_discovery_sessions s where s.id = route_discovery_locations.session_id and s.user_id = (select auth.uid())));

drop policy if exists offline_packs_owner on public.offline_packs;
create policy offline_packs_owner on public.offline_packs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists offline_pack_locations_owner on public.offline_pack_locations;
create policy offline_pack_locations_owner on public.offline_pack_locations for all to authenticated using (exists (select 1 from public.offline_packs p where p.id = offline_pack_locations.pack_id and p.user_id = (select auth.uid()))) with check (exists (select 1 from public.offline_packs p where p.id = offline_pack_locations.pack_id and p.user_id = (select auth.uid())));
drop policy if exists offline_pack_businesses_owner on public.offline_pack_businesses;
create policy offline_pack_businesses_owner on public.offline_pack_businesses for all to authenticated using (exists (select 1 from public.offline_packs p where p.id = offline_pack_businesses.pack_id and p.user_id = (select auth.uid()))) with check (exists (select 1 from public.offline_packs p where p.id = offline_pack_businesses.pack_id and p.user_id = (select auth.uid())));
drop policy if exists offline_pack_events_owner on public.offline_pack_events;
create policy offline_pack_events_owner on public.offline_pack_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);