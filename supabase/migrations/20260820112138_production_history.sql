create table if not exists public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 intelligence boolean not null default true,
 rewards boolean not null default true,
 community boolean not null default true,
 push boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own on public.notification_preferences for select to authenticated using(auth.uid()=user_id);
drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own on public.notification_preferences for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own on public.notification_preferences for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
revoke all on public.notification_preferences from anon;
grant select,insert,update on public.notification_preferences to authenticated;
