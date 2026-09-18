alter table public.qr_attribution_events enable row level security;
alter table public.enterprise_partner_networks enable row level security;
alter table public.enterprise_partner_campaigns enable row level security;
alter table public.enterprise_partner_campaign_outcomes enable row level security;
alter table public.enterprise_partner_network_metrics enable row level security;

-- Canonical policy contracts are already present in production; these guarded
-- blocks make the migration idempotent and preserve the established predicates.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_ins' and policyname='checkins_own_select') then
    create policy checkins_own_select on public.check_ins for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='enterprise_partner_networks' and policyname='enterprise_partner_networks_admin_read') then
    create policy enterprise_partner_networks_admin_read on public.enterprise_partner_networks for select to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_admin,false)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fleet_operational_events' and policyname='fleet_operational_events_authorized_read') then
    create policy fleet_operational_events_authorized_read on public.fleet_operational_events for select to authenticated using (fleet_observe_access(business_id));
  end if;
end $$;
