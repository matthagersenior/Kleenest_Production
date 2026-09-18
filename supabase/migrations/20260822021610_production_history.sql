alter table public.user_location_sessions enable row level security;

drop policy if exists user_location_sessions_select_own on public.user_location_sessions;
drop policy if exists user_location_sessions_insert_own on public.user_location_sessions;
drop policy if exists user_location_sessions_update_own on public.user_location_sessions;
drop policy if exists user_location_sessions_delete_own on public.user_location_sessions;

create policy user_location_sessions_select_own on public.user_location_sessions
for select to authenticated
using (user_id = auth.uid());

create policy user_location_sessions_insert_own on public.user_location_sessions
for insert to authenticated
with check (user_id = auth.uid());

create policy user_location_sessions_update_own on public.user_location_sessions
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy user_location_sessions_delete_own on public.user_location_sessions
for delete to authenticated
using (user_id = auth.uid());
