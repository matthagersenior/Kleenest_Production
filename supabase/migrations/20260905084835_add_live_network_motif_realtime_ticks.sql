create table if not exists public.live_network_motif_ticks (
  scope_key text primary key,
  scope_type text not null check (scope_type in ('network','business')),
  scope_id uuid null,
  revision bigint not null default 1,
  changed_at timestamptz not null default now(),
  source_category text not null default 'network_activity',
  constraint live_network_motif_ticks_scope_shape check (
    (scope_type='network' and scope_id is null and scope_key='network')
    or (scope_type='business' and scope_id is not null and scope_key=('business:' || scope_id::text))
  )
);

alter table public.live_network_motif_ticks enable row level security;
revoke all on table public.live_network_motif_ticks from public, anon;
revoke insert, update, delete on table public.live_network_motif_ticks from authenticated;
grant select on table public.live_network_motif_ticks to authenticated;

drop policy if exists live_network_motif_ticks_authenticated_read on public.live_network_motif_ticks;
create policy live_network_motif_ticks_authenticated_read
on public.live_network_motif_ticks
for select
to authenticated
using (
  scope_type='network'
  or public.is_platform_owner_session()
  or (scope_type='business' and public.can_manage_business(scope_id))
);

insert into public.live_network_motif_ticks(scope_key,scope_type,scope_id,revision,changed_at,source_category)
values('network','network',null,1,now(),'network_activity')
on conflict(scope_key) do nothing;

create or replace function public.touch_live_network_motif_tick()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business_id uuid;
  v_public_network boolean := false;
  v_location_id uuid;
begin
  if tg_table_name='location_discovery_events' then
    v_public_network := true;
  elsif tg_table_name='location_route_events' then
    v_location_id := new.location_id;
    v_public_network := true;
  elsif tg_table_name='location_quality_observations' then
    v_location_id := new.location_id;
    v_public_network := true;
  elsif tg_table_name='location_occupancy_observations' then
    v_location_id := new.location_id;
    v_public_network := true;
  elsif tg_table_name='geofence_events' then
    v_business_id := new.business_id;
  elsif tg_table_name='fleet_operational_events' then
    v_business_id := new.business_id;
  elsif tg_table_name='fleet_alerts' then
    v_business_id := new.business_id;
  elsif tg_table_name='live_network_events' then
    v_location_id := new.location_id;
    v_public_network := new.event_type in (
      'privacy_safe','aggregate_snapshot','public_announcement','public_offer_moment',
      'source_health_degraded','source_health_recovered'
    );
  end if;

  if v_business_id is null and v_location_id is not null then
    select l.business_id into v_business_id
    from public.locations l
    where l.id=v_location_id;
  end if;

  if v_public_network then
    insert into public.live_network_motif_ticks(scope_key,scope_type,scope_id,revision,changed_at,source_category)
    values('network','network',null,1,now(),'network_activity')
    on conflict(scope_key) do update
      set revision=public.live_network_motif_ticks.revision+1,
          changed_at=excluded.changed_at,
          source_category='network_activity';
  end if;

  if v_business_id is not null then
    insert into public.live_network_motif_ticks(scope_key,scope_type,scope_id,revision,changed_at,source_category)
    values('business:'||v_business_id::text,'business',v_business_id,1,now(),'business_activity')
    on conflict(scope_key) do update
      set revision=public.live_network_motif_ticks.revision+1,
          changed_at=excluded.changed_at,
          source_category='business_activity';
  end if;

  return new;
end;
$$;

revoke all on function public.touch_live_network_motif_tick() from public, anon, authenticated;

drop trigger if exists live_network_motif_tick_discovery on public.location_discovery_events;
create trigger live_network_motif_tick_discovery after insert on public.location_discovery_events
for each row execute function public.touch_live_network_motif_tick();

drop trigger if exists live_network_motif_tick_route on public.location_route_events;
create trigger live_network_motif_tick_route after insert on public.location_route_events
for each row execute function public.touch_live_network_motif_tick();

drop trigger if exists live_network_motif_tick_quality on public.location_quality_observations;
create trigger live_network_motif_tick_quality after insert on public.location_quality_observations
for each row execute function public.touch_live_network_motif_tick();

drop trigger if exists live_network_motif_tick_occupancy on public.location_occupancy_observations;
create trigger live_network_motif_tick_occupancy after insert on public.location_occupancy_observations
for each row execute function public.touch_live_network_motif_tick();

drop trigger if exists live_network_motif_tick_geofence on public.geofence_events;
create trigger live_network_motif_tick_geofence after insert on public.geofence_events
for each row execute function public.touch_live_network_motif_tick();

drop trigger if exists live_network_motif_tick_fleet_event on public.fleet_operational_events;
create trigger live_network_motif_tick_fleet_event after insert on public.fleet_operational_events
for each row execute function public.touch_live_network_motif_tick();

drop trigger if exists live_network_motif_tick_fleet_alert on public.fleet_alerts;
create trigger live_network_motif_tick_fleet_alert after insert or update on public.fleet_alerts
for each row execute function public.touch_live_network_motif_tick();

drop trigger if exists live_network_motif_tick_live_event on public.live_network_events;
create trigger live_network_motif_tick_live_event after insert on public.live_network_events
for each row execute function public.touch_live_network_motif_tick();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='live_network_motif_ticks'
  ) then
    alter publication supabase_realtime add table public.live_network_motif_ticks;
  end if;
end;
$$;

insert into public.capability_function_classifications(function_signature,domain,classification,rationale,created_at,updated_at)
values(
  'live_network_motif_snapshot(p_business_id uuid, p_window_minutes integer)',
  'network_intelligence',
  'canonical',
  'Canonical privacy-safe motif analysis consumed across Consumer, Business, Fleet, and Owner Live Network surfaces.',
  now(),now()
)
on conflict(function_signature) do update
set domain=excluded.domain,
    classification=excluded.classification,
    rationale=excluded.rationale,
    updated_at=now();
