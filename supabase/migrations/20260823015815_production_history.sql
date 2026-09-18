begin;

alter table public.leaderboard_rewards enable row level security;
alter table public.network_leaderboard_sources enable row level security;
alter table public.network_leaderboard_participation enable row level security;
alter table public.geofence_events enable row level security;
alter table public.qr_engagement_programs enable row level security;
alter table public.quests enable row level security;
alter table public.quest_steps enable row level security;
alter table public.quest_participation enable row level security;
alter table public.quest_step_events enable row level security;

-- Catalog/discovery reads. No direct client writes.
create policy network_leaderboard_sources_public_read on public.network_leaderboard_sources
  for select to anon, authenticated using (active = true);

create policy quests_published_read on public.quests
  for select to anon, authenticated using (status in ('active','published','live'));

create policy quest_steps_published_read on public.quest_steps
  for select to anon, authenticated using (exists (
    select 1 from public.quests q
    where q.id = quest_steps.quest_id
      and q.status in ('active','published','live')
  ));

create policy qr_engagement_programs_active_read on public.qr_engagement_programs
  for select to anon, authenticated using (active = true);

-- User-owned telemetry/progression records. Mutations remain user-scoped.
create policy geofence_events_own_read on public.geofence_events
  for select to authenticated using (user_id = auth.uid());
create policy geofence_events_own_insert on public.geofence_events
  for insert to authenticated with check (user_id = auth.uid());

create policy quest_participation_own_read on public.quest_participation
  for select to authenticated using (user_id = auth.uid());
create policy quest_participation_own_insert on public.quest_participation
  for insert to authenticated with check (user_id = auth.uid());

create policy quest_step_events_own_read on public.quest_step_events
  for select to authenticated using (user_id = auth.uid());
create policy quest_step_events_own_insert on public.quest_step_events
  for insert to authenticated with check (user_id = auth.uid());

-- Controller-owned state has no direct client table access; existing privileged RPCs remain the write gateway.
commit;
