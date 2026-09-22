-- Privacy-preserving operational telemetry for third-party AdMob network health.
-- Stores no user, device, location, targeting, or content data.

create table if not exists public.admob_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  placement_code text not null,
  platform text not null,
  ad_unit_id text,
  response_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint admob_telemetry_events_event_type_check
    check (event_type in ('initialized','request','fill','impression','click','paid','no_fill','load_error','consent_blocked','initialization_error')),
  constraint admob_telemetry_events_platform_check
    check (platform in ('android','ios')),
  constraint admob_telemetry_events_placement_check
    check (placement_code ~ '^[a-z0-9_-]{1,80}$')
);

alter table public.admob_telemetry_events enable row level security;
revoke all on public.admob_telemetry_events from public;
revoke all on public.admob_telemetry_events from anon,authenticated;
grant select,insert,delete on public.admob_telemetry_events to service_role;

create index if not exists admob_telemetry_events_created_idx
  on public.admob_telemetry_events(created_at desc);
create index if not exists admob_telemetry_events_placement_created_idx
  on public.admob_telemetry_events(placement_code,created_at desc);
create index if not exists admob_telemetry_events_type_created_idx
  on public.admob_telemetry_events(event_type,created_at desc);

create or replace function public.record_admob_telemetry_event(
  p_event_type text,
  p_placement_code text,
  p_platform text,
  p_ad_unit_id text default null,
  p_response_id text default null,
  p_error_code text default null,
  p_error_message text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_event_type text := lower(trim(coalesce(p_event_type,'')));
  v_placement text := lower(trim(coalesce(p_placement_code,'')));
  v_platform text := lower(trim(coalesce(p_platform,'')));
  v_ad_unit text := nullif(trim(coalesce(p_ad_unit_id,'')),'');
begin
  if v_event_type not in ('initialized','request','fill','impression','click','paid','no_fill','load_error','consent_blocked','initialization_error') then
    raise exception 'Unsupported AdMob telemetry event' using errcode='22023';
  end if;
  if v_placement !~ '^[a-z0-9_-]{1,80}$' then
    raise exception 'Invalid AdMob placement code' using errcode='22023';
  end if;
  if v_platform not in ('android','ios') then
    raise exception 'Unsupported AdMob platform' using errcode='22023';
  end if;
  if v_ad_unit is not null and v_ad_unit not in (
    'ca-app-pub-6958734306376288/6751375017',
    'ca-app-pub-6958734306376288/2327160255'
  ) then
    raise exception 'Unexpected AdMob ad unit' using errcode='22023';
  end if;

  insert into public.admob_telemetry_events(
    event_type,placement_code,platform,ad_unit_id,response_id,error_code,error_message
  )
  values(
    v_event_type,
    v_placement,
    v_platform,
    v_ad_unit,
    nullif(left(trim(coalesce(p_response_id,'')),200),''),
    nullif(left(trim(coalesce(p_error_code,'')),120),''),
    nullif(left(trim(coalesce(p_error_message,'')),500),'')
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.record_admob_telemetry_event(text,text,text,text,text,text,text) from public;
grant execute on function public.record_admob_telemetry_event(text,text,text,text,text,text,text) to anon,authenticated,service_role;

create or replace function public.owner_admob_health_snapshot(p_hours integer default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_hours integer := greatest(1,least(coalesce(p_hours,24),168));
  v_requests bigint := 0;
  v_fills bigint := 0;
  v_impressions bigint := 0;
  v_clicks bigint := 0;
  v_no_fill bigint := 0;
  v_load_errors bigint := 0;
  v_initialized bigint := 0;
  v_initialization_errors bigint := 0;
  v_consent_blocked bigint := 0;
  v_last_event_at timestamptz;
  v_placements jsonb := '[]'::jsonb;
  v_failures jsonb := '[]'::jsonb;
  v_status text;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;

  select
    count(*) filter(where e.event_type='request'),
    count(*) filter(where e.event_type='fill'),
    count(*) filter(where e.event_type='impression'),
    count(*) filter(where e.event_type='click'),
    count(*) filter(where e.event_type='no_fill'),
    count(*) filter(where e.event_type='load_error'),
    count(*) filter(where e.event_type='initialized'),
    count(*) filter(where e.event_type='initialization_error'),
    count(*) filter(where e.event_type='consent_blocked'),
    max(e.created_at)
  into
    v_requests,v_fills,v_impressions,v_clicks,v_no_fill,v_load_errors,
    v_initialized,v_initialization_errors,v_consent_blocked,v_last_event_at
  from public.admob_telemetry_events e
  where e.created_at>=now()-make_interval(hours=>v_hours);

  select coalesce(jsonb_agg(row_data order by (row_data->>'requests')::bigint desc,row_data->>'placement_code'),'[]'::jsonb)
  into v_placements
  from (
    select jsonb_build_object(
      'placement_code',e.placement_code,
      'requests',count(*) filter(where e.event_type='request'),
      'fills',count(*) filter(where e.event_type='fill'),
      'impressions',count(*) filter(where e.event_type='impression'),
      'clicks',count(*) filter(where e.event_type='click'),
      'no_fill',count(*) filter(where e.event_type='no_fill'),
      'load_errors',count(*) filter(where e.event_type='load_error'),
      'last_event_at',max(e.created_at)
    ) row_data
    from public.admob_telemetry_events e
    where e.created_at>=now()-make_interval(hours=>v_hours)
      and e.placement_code<>'sdk'
    group by e.placement_code
  ) p;

  select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc),'[]'::jsonb)
  into v_failures
  from (
    select e.event_type,e.placement_code,e.platform,e.error_code,e.error_message,e.created_at
    from public.admob_telemetry_events e
    where e.created_at>=now()-make_interval(hours=>v_hours)
      and e.event_type in ('no_fill','load_error','consent_blocked','initialization_error')
    order by e.created_at desc
    limit 20
  ) f;

  v_status := case
    when v_requests=0 and v_initialized=0 and v_initialization_errors=0 and v_consent_blocked=0 then 'no_data'
    when v_initialization_errors>0 and v_initialized=0 then 'initialization_error'
    when v_requests>0 and v_fills=0 and v_no_fill>0 then 'no_fill'
    when v_requests>=3 and v_fills=0 then 'degraded'
    when v_fills>0 then 'receiving_fills'
    else 'warming_up'
  end;

  return jsonb_build_object(
    'hours',v_hours,
    'status',v_status,
    'requests',v_requests,
    'fills',v_fills,
    'fill_rate',case when v_requests=0 then null else round((100.0*v_fills/v_requests)::numeric,1) end,
    'impressions',v_impressions,
    'impression_rate',case when v_fills=0 then null else round((100.0*v_impressions/v_fills)::numeric,1) end,
    'clicks',v_clicks,
    'ctr',case when v_impressions=0 then null else round((100.0*v_clicks/v_impressions)::numeric,2) end,
    'no_fill',v_no_fill,
    'load_errors',v_load_errors,
    'initialized',v_initialized,
    'initialization_errors',v_initialization_errors,
    'consent_blocked',v_consent_blocked,
    'last_event_at',v_last_event_at,
    'placements',v_placements,
    'recent_failures',v_failures,
    'privacy',jsonb_build_object(
      'stores_user_id',false,
      'stores_device_id',false,
      'stores_location',false,
      'stores_targeting',false
    )
  );
end;
$$;
revoke all on function public.owner_admob_health_snapshot(integer) from public,anon;
grant execute on function public.owner_admob_health_snapshot(integer) to authenticated,service_role;

comment on table public.admob_telemetry_events is
  'Privacy-preserving operational AdMob health events. No user, device, location, targeting, or content fields are stored.';
comment on function public.record_admob_telemetry_event(text,text,text,text,text,text,text) is
  'Validated client telemetry endpoint for AdMob SDK/request/fill/impression/click/error health.';
comment on function public.owner_admob_health_snapshot(integer) is
  'Platform-owner aggregate AdMob health summary for up to seven days.';
