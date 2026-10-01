-- Federated place discovery: Overture is the durable non-OSM POI backbone.
-- Consumer search remains nonblocking; searched areas enqueue bounded hydration work.
-- Google Places is intentionally not part of this authority.

insert into public.external_data_sources(
  source_key,name,source_url,license_name,license_url,attribution_text,active,updated_at
)
values(
  'overture',
  'Overture Maps Places',
  'https://docs.overturemaps.org/guides/places/',
  'CDLA Permissive 2.0 / Apache 2.0 / CC0 by contributing provider',
  'https://docs.overturemaps.org/attribution/',
  'Overture Maps Foundation; preserve release/source attribution metadata.',
  true,
  now()
)
on conflict(source_key) do update set
  name=excluded.name,
  source_url=excluded.source_url,
  license_name=excluded.license_name,
  license_url=excluded.license_url,
  attribution_text=excluded.attribution_text,
  active=true,
  updated_at=now();

insert into public.national_ingestion_source_policies(
  source_key,enabled,priority,quota_mode,daily_request_limit,hourly_request_limit,
  daily_byte_limit,min_interval_seconds,max_requests_per_cycle,policy_url,notes,updated_at
)
values(
  'overture',true,5,'public_release',null,null,null,0,4,
  'https://docs.overturemaps.org/getting-data/',
  'Public GeoParquet release. Ingest bounded market/search bboxes through canonical ingest_external_locations; use STAC latest-release discovery and GERS IDs for stable source identity.',
  now()
)
on conflict(source_key) do update set
  enabled=excluded.enabled,
  priority=excluded.priority,
  quota_mode=excluded.quota_mode,
  min_interval_seconds=excluded.min_interval_seconds,
  max_requests_per_cycle=excluded.max_requests_per_cycle,
  policy_url=excluded.policy_url,
  notes=excluded.notes,
  updated_at=now();

create table if not exists public.place_discovery_hydration_queue(
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  source_key text not null default 'overture',
  market_key text,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  radius_meters integer not null check(radius_meters between 100 and 40234),
  bbox jsonb not null check(jsonb_typeof(bbox)='array' and jsonb_array_length(bbox)=4),
  priority integer not null default 100,
  status text not null default 'pending' check(status in ('pending','running','completed','failed')),
  release text,
  attempt_count integer not null default 0,
  records_seen integer not null default 0,
  records_imported integer not null default 0,
  records_updated integer not null default 0,
  skipped_rows integer not null default 0,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists place_discovery_hydration_queue_work_idx
  on public.place_discovery_hydration_queue(status,priority,requested_at);

alter table public.place_discovery_hydration_queue enable row level security;
revoke all on table public.place_discovery_hydration_queue from anon,authenticated;

create or replace function public.enqueue_place_discovery_hydration(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer default 8047
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_radius integer;
  v_lat_delta double precision;
  v_lng_delta double precision;
  v_radius_bucket integer;
  v_key text;
  v_existing public.place_discovery_hydration_queue%rowtype;
  v_row public.place_discovery_hydration_queue%rowtype;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception 'valid lat/lng required';
  end if;

  v_radius:=least(40234,greatest(1609,coalesce(p_radius_meters,8047)));
  v_radius_bucket:=case
    when v_radius<=1609 then 1609
    when v_radius<=3219 then 3219
    when v_radius<=8047 then 8047
    when v_radius<=16093 then 16093
    else 40234
  end;
  v_lat_delta:=v_radius_bucket/111320.0;
  v_lng_delta:=v_radius_bucket/(111320.0*greatest(cos(radians(p_latitude)),0.2));
  v_key:='consumer:'||
    round(p_latitude::numeric,2)::text||':'||
    round(p_longitude::numeric,2)::text||':'||
    v_radius_bucket::text;

  select q.* into v_existing
  from public.place_discovery_hydration_queue q
  where q.request_key=v_key
    and (
      q.status in ('pending','running')
      or (q.status='completed' and q.completed_at>now()-interval '30 days')
    )
  limit 1;

  if found then
    return jsonb_build_object(
      'queued',v_existing.status='pending',
      'request_id',v_existing.id,
      'status',v_existing.status,
      'recently_hydrated',v_existing.status='completed'
    );
  end if;

  insert into public.place_discovery_hydration_queue(
    request_key,source_key,latitude,longitude,radius_meters,bbox,priority,status,
    requested_at,completed_at,last_error,updated_at
  )
  values(
    v_key,'overture',p_latitude,p_longitude,v_radius_bucket,
    jsonb_build_array(
      p_longitude-v_lng_delta,
      p_latitude-v_lat_delta,
      p_longitude+v_lng_delta,
      p_latitude+v_lat_delta
    ),
    20,'pending',now(),null,null,now()
  )
  on conflict(request_key) do update set
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    radius_meters=excluded.radius_meters,
    bbox=excluded.bbox,
    priority=least(public.place_discovery_hydration_queue.priority,excluded.priority),
    status=case when public.place_discovery_hydration_queue.status='running' then 'running' else 'pending' end,
    requested_at=now(),
    started_at=case when public.place_discovery_hydration_queue.status='running' then public.place_discovery_hydration_queue.started_at else null end,
    completed_at=case when public.place_discovery_hydration_queue.status='running' then public.place_discovery_hydration_queue.completed_at else null end,
    last_error=null,
    updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'queued',true,
    'request_id',v_row.id,
    'status',v_row.status,
    'recently_hydrated',false
  );
end;
$function$;

revoke all on function public.enqueue_place_discovery_hydration(double precision,double precision,integer) from public;
grant execute on function public.enqueue_place_discovery_hydration(double precision,double precision,integer) to anon,authenticated;

-- Seed the existing active Kleenest ingestion frontier so Overture immediately
-- complements the OSM inventory already being collected there.
insert into public.place_discovery_hydration_queue(
  request_key,source_key,market_key,latitude,longitude,radius_meters,bbox,priority,status,requested_at,updated_at
)
select
  'market:'||m.market_key,
  'overture',
  m.market_key,
  (((m.bbox->>0)::double precision+(m.bbox->>2)::double precision)/2.0),
  (((m.bbox->>1)::double precision+(m.bbox->>3)::double precision)/2.0),
  40234,
  jsonb_build_array(
    (m.bbox->>1)::double precision,
    (m.bbox->>0)::double precision,
    (m.bbox->>3)::double precision,
    (m.bbox->>2)::double precision
  ),
  m.priority,
  'pending',
  now(),
  now()
from public.national_ingestion_markets m
where m.status='running'
  and jsonb_typeof(m.bbox)='array'
  and jsonb_array_length(m.bbox)=4
on conflict(request_key) do nothing;
