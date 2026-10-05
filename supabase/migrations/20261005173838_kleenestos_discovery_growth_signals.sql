-- KleenestOS Discovery growth intelligence: unexpected territory signals and owner notifications.
create table if not exists public.discovery_growth_signals (
  cell_key text primary key,
  latitude double precision not null,
  longitude double precision not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  event_count integer not null default 0,
  discovered_count integer not null default 0,
  distinct_users integer not null default 0,
  sources text[] not null default '{}',
  stage text not null default 'observed' check (stage in ('observed','emerging','ingestion_candidate')),
  last_notified_stage text,
  promoted_at timestamptz
);
alter table public.discovery_growth_signals enable row level security;
revoke all on table public.discovery_growth_signals from anon, authenticated;

create or replace function public.capture_discovery_growth_signal()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_expected boolean:=false;
  v_key text;
  v_stage text;
  v_prev_stage text;
  v_events integer;
  v_discovered integer;
  v_users integer;
  v_sources text[];
begin
  select exists(
    select 1 from public.national_ingestion_markets m
    where m.status in ('pending','running','complete')
      and jsonb_typeof(m.bbox)='array' and jsonb_array_length(m.bbox)>=4
      and new.latitude between (m.bbox->>0)::double precision and (m.bbox->>2)::double precision
      and new.longitude between (m.bbox->>1)::double precision and (m.bbox->>3)::double precision
  ) into v_expected;
  if v_expected then return new; end if;

  v_key:=round(new.latitude::numeric,1)::text||':'||round(new.longitude::numeric,1)::text;
  select stage into v_prev_stage from public.discovery_growth_signals where cell_key=v_key;

  insert into public.discovery_growth_signals(cell_key,latitude,longitude,event_count,discovered_count,distinct_users,sources)
  values(v_key,round(new.latitude::numeric,1)::double precision,round(new.longitude::numeric,1)::double precision,1,greatest(coalesce(new.discovered_count,0),0),1,coalesce(new.sources,'{}'))
  on conflict(cell_key) do update set
    last_seen_at=now(),
    event_count=public.discovery_growth_signals.event_count+1,
    discovered_count=public.discovery_growth_signals.discovered_count+greatest(coalesce(new.discovered_count,0),0),
    sources=(select array_agg(distinct x) from unnest(public.discovery_growth_signals.sources||coalesce(new.sources,'{}')) x);

  select count(distinct e.user_id)::integer into v_users
  from public.location_discovery_events e
  where e.created_at>=now()-interval '30 days'
    and round(e.latitude::numeric,1)::text||':'||round(e.longitude::numeric,1)::text=v_key;
  update public.discovery_growth_signals set distinct_users=greatest(coalesce(v_users,1),1) where cell_key=v_key;

  select event_count,discovered_count,distinct_users,sources into v_events,v_discovered,v_users,v_sources
  from public.discovery_growth_signals where cell_key=v_key;

  v_stage:=case
    when v_events>=8 or v_users>=3 or v_discovered>=75 then 'ingestion_candidate'
    when v_events>=3 or v_users>=2 or v_discovered>=25 then 'emerging'
    else 'observed'
  end;

  update public.discovery_growth_signals
  set stage=v_stage,promoted_at=case when stage is distinct from v_stage then now() else promoted_at end
  where cell_key=v_key;

  if v_stage in ('emerging','ingestion_candidate') and v_stage is distinct from coalesce(v_prev_stage,'observed') then
    insert into public.notifications(user_id,type,title,body,data)
    select p.id,'discovery_growth_signal',
      case when v_stage='ingestion_candidate' then 'Discovery found an ingestion opportunity' else 'New Discovery territory is emerging' end,
      format('Unexpected Discovery activity near %.1f, %.1f: %s events, %s discovered places, %s users.',new.latitude,new.longitude,v_events,v_discovered,v_users),
      jsonb_build_object('deep_link','/ingestion','cell_key',v_key,'stage',v_stage,'latitude',new.latitude,'longitude',new.longitude,'event_count',v_events,'discovered_count',v_discovered,'distinct_users',v_users,'sources',to_jsonb(v_sources))
    from public.profiles p where p.is_platform_owner=true;
    update public.discovery_growth_signals set last_notified_stage=v_stage where cell_key=v_key;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_discovery_growth_signal() from public, anon, authenticated;

drop trigger if exists trg_capture_discovery_growth_signal on public.location_discovery_events;
create trigger trg_capture_discovery_growth_signal after insert on public.location_discovery_events
for each row execute function public.capture_discovery_growth_signal();

create or replace function public.owner_discovery_growth_signals(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_limit,25),1),100);
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by
    case s.stage when 'ingestion_candidate' then 1 when 'emerging' then 2 else 3 end,s.last_seen_at desc)
    from (select * from public.discovery_growth_signals order by
      case stage when 'ingestion_candidate' then 1 when 'emerging' then 2 else 3 end,last_seen_at desc limit v_limit) s),'[]'::jsonb);
end;
$$;
revoke all on function public.owner_discovery_growth_signals(integer) from public, anon;
grant execute on function public.owner_discovery_growth_signals(integer) to authenticated;
