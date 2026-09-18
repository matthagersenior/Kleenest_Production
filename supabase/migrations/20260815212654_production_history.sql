create table if not exists public.business_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_campaigns_business_id_idx on public.business_campaigns(business_id);

alter table public.business_campaigns enable row level security;

drop policy if exists business_campaigns_member_select on public.business_campaigns;
drop policy if exists business_campaigns_member_write on public.business_campaigns;
create policy business_campaigns_member_select on public.business_campaigns for select using (
  exists (select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=business_campaigns.business_id and bm.user_id=auth.uid()
      and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard')
);
create policy business_campaigns_member_write on public.business_campaigns for all using (
  exists (select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=business_campaigns.business_id and bm.user_id=auth.uid()
      and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard')
) with check (
  exists (select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=business_campaigns.business_id and bm.user_id=auth.uid()
      and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard')
);

-- Advanced CRUD is available only to Growth/Enterprise owners, admins and managers.
drop policy if exists promotions_member_all on public.promotions;
create policy promotions_member_advanced_all on public.promotions for all using (
  exists (select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=promotions.business_id and bm.user_id=auth.uid()
      and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard')
) with check (
  exists (select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=promotions.business_id and bm.user_id=auth.uid()
      and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard')
);

drop policy if exists events_member_all on public.business_events;
create policy events_member_advanced_all on public.business_events for all using (
  exists (select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=business_events.business_id and bm.user_id=auth.uid()
      and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard')
) with check (
  exists (select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=business_events.business_id and bm.user_id=auth.uid()
      and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard')
);

drop policy if exists contests_member_advanced_all on public.contests;
create policy contests_member_advanced_all on public.contests for all using (
  exists (select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=contests.business_id and bm.user_id=auth.uid()
      and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard')
) with check (
  exists (select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id
    where bm.business_id=contests.business_id and bm.user_id=auth.uid()
      and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard')
);
