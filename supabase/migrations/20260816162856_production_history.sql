drop policy if exists follows_owner on public.follows;
drop policy if exists social_activity_own_insert on public.social_activity;
create policy social_activity_own_insert on public.social_activity for insert to authenticated with check (auth.uid() = user_id and (actor_user_id is null or auth.uid() = actor_user_id));

alter table public.messages drop constraint if exists messages_no_self_message;
alter table public.messages add constraint messages_no_self_message check (from_id <> to_id);

create index if not exists messages_unread_recipient_idx on public.messages (to_id, created_at desc) where read_at is null;
create index if not exists notifications_unread_user_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists social_activity_user_created_at_idx on public.social_activity (user_id, created_at desc);
create index if not exists social_activity_post_created_at_idx on public.social_activity (post_id, created_at desc) where post_id is not null;
