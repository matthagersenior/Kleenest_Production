create or replace function public.admin_data_integrity_summary()
returns table(issue_code text, issue_count bigint, severity text)
language sql stable security definer
set search_path=public
as $$
  select * from (
    select 'orphan_business_members'::text, count(*)::bigint, 'high'::text
    from public.business_members bm left join public.businesses b on b.id=bm.business_id where b.id is null
    union all
    select 'orphan_business_locations', count(*)::bigint, 'high'
    from public.locations l left join public.businesses b on b.id=l.business_id where l.business_id is not null and b.id is null
    union all
    select 'orphan_qr_locations', count(*)::bigint, 'high'
    from public.qr_codes q left join public.locations l on l.id=q.location_id where q.location_id is not null and l.id is null
    union all
    select 'orphan_enterprise_campaign_networks', count(*)::bigint, 'high'
    from public.enterprise_partner_campaigns c left join public.enterprise_partner_networks n on n.id=c.network_id where n.id is null
    union all
    select 'orphan_enterprise_network_members', count(*)::bigint, 'high'
    from public.enterprise_partner_network_members m left join public.enterprise_partner_networks n on n.id=m.network_id where n.id is null
    union all
    select 'orphan_notifications', count(*)::bigint, 'medium'
    from public.notifications n left join public.profiles p on p.id=n.user_id where p.id is null
  ) x
  where exists (select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_admin,false));
$$;
revoke all on function public.admin_data_integrity_summary() from public,anon;
grant execute on function public.admin_data_integrity_summary() to authenticated,service_role;

create table if not exists public.qr_attribution_events (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references public.qr_codes(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action_type text not null default 'scan',
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists qr_attribution_qr_idx on public.qr_attribution_events(qr_code_id,created_at desc);
create index if not exists qr_attribution_business_idx on public.qr_attribution_events(business_id,created_at desc);
create index if not exists qr_attribution_location_idx on public.qr_attribution_events(location_id,created_at desc);
alter table public.qr_attribution_events enable row level security;
drop policy if exists qr_attribution_read_own on public.qr_attribution_events;
create policy qr_attribution_read_own on public.qr_attribution_events for select using (user_id=auth.uid());
