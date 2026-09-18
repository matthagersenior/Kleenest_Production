drop policy if exists notifications_select_own on public.notifications; create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
