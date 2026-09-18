drop policy if exists user_badges_public_select on public.user_badges;
create policy user_badges_select on public.user_badges for select to authenticated using (user_id = auth.uid());

alter table public.user_badges enable row level security;
alter table public.point_transactions enable row level security;
alter table public.progression_challenges enable row level security;
alter table public.social_challenge_entries enable row level security;
alter table public.contest_entries enable row level security;
alter table public.route_plans enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

create index if not exists user_badges_user_earned_at_idx on public.user_badges (user_id, earned_at desc);
create index if not exists point_transactions_user_created_at_idx on public.point_transactions (user_id, created_at desc);
create index if not exists social_challenge_entries_challenge_idx on public.social_challenge_entries (challenge_id, user_id);
create index if not exists route_plans_user_created_at_idx on public.route_plans (user_id, created_at desc);
