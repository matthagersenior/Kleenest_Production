drop policy if exists social_activity_public_read on public.social_activity;
create policy social_activity_public_read on public.social_activity for select to authenticated using (user_id = auth.uid() or actor_user_id = auth.uid());

alter table public.social_activity enable row level security;

create index if not exists social_activity_actor_created_at_idx on public.social_activity (actor_user_id, created_at desc) where actor_user_id is not null;
create index if not exists social_activity_post_created_at_idx on public.social_activity (post_id, created_at desc) where post_id is not null;
