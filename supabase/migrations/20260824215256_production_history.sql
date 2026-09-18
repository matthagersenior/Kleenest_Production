drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists profile_preferences_owner_all on public.profile_preferences;
create policy profile_preferences_owner_all on public.profile_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notification_push_subscriptions_insert_own on public.notification_push_subscriptions;
create policy notification_push_subscriptions_insert_own on public.notification_push_subscriptions for insert to authenticated with check (user_id = auth.uid());
