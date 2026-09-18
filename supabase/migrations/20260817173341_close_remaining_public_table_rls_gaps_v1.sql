begin;

alter table public.ad_placements enable row level security;
alter table public.pricing_plans enable row level security;

drop policy if exists kleenest_ad_placements_public_read on public.ad_placements;
drop policy if exists kleenest_pricing_plans_public_read on public.pricing_plans;

create policy kleenest_ad_placements_public_read on public.ad_placements for select to anon, authenticated using (active = true);
create policy kleenest_pricing_plans_public_read on public.pricing_plans for select to anon, authenticated using (active = true);

commit;
