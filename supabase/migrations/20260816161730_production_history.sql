create index if not exists social_activity_user_created_at_idx on public.social_activity (user_id, created_at desc);
create index if not exists contest_entries_user_joined_at_idx on public.contest_entries (user_id, joined_at desc);
create index if not exists route_plans_user_created_at_idx on public.route_plans (user_id, created_at desc);
create index if not exists user_badges_user_earned_at_idx on public.user_badges (user_id, earned_at desc);
create index if not exists point_transactions_user_created_at_idx on public.point_transactions (user_id, created_at desc);

alter table public.social_challenge_entries replica identity full;
alter table public.contest_entries replica identity full;
alter table public.route_plans replica identity full;
alter table public.user_badges replica identity full;
alter table public.point_transactions replica identity full;

alter publication supabase_realtime add table public.social_challenge_entries;
alter publication supabase_realtime add table public.contest_entries;
alter publication supabase_realtime add table public.route_plans;
alter publication supabase_realtime add table public.user_badges;
alter publication supabase_realtime add table public.point_transactions;
