alter table public.place_compat_overrides enable row level security;
alter table public.progression_xp_actions enable row level security;
alter table public.progression_specialty_levels enable row level security;
alter table public.progression_global_levels enable row level security;
alter table public.progression_objectives_v2 enable row level security;

revoke insert, update, delete, truncate, references, trigger on table public.place_compat_overrides from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.progression_xp_actions from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.progression_specialty_levels from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.progression_global_levels from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.progression_objectives_v2 from anon, authenticated;

grant select on table public.place_compat_overrides to anon, authenticated;
grant select on table public.progression_xp_actions to authenticated;
grant select on table public.progression_specialty_levels to authenticated;
grant select on table public.progression_global_levels to authenticated;
grant select on table public.progression_objectives_v2 to authenticated;

drop policy if exists place_compat_overrides_public_read on public.place_compat_overrides;
create policy place_compat_overrides_public_read on public.place_compat_overrides for select to anon, authenticated using (location_id is not null and place_id is not null);

drop policy if exists progression_xp_actions_authenticated_read on public.progression_xp_actions;
create policy progression_xp_actions_authenticated_read on public.progression_xp_actions for select to authenticated using ((select auth.uid()) is not null and enabled = true);

drop policy if exists progression_specialty_levels_authenticated_read on public.progression_specialty_levels;
create policy progression_specialty_levels_authenticated_read on public.progression_specialty_levels for select to authenticated using ((select auth.uid()) is not null and level >= 1);

drop policy if exists progression_global_levels_authenticated_read on public.progression_global_levels;
create policy progression_global_levels_authenticated_read on public.progression_global_levels for select to authenticated using ((select auth.uid()) is not null and level >= 1);

drop policy if exists progression_objectives_v2_authenticated_read on public.progression_objectives_v2;
create policy progression_objectives_v2_authenticated_read on public.progression_objectives_v2 for select to authenticated using ((select auth.uid()) is not null and status in ('active','upcoming'));
