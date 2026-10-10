-- National ingestion + Owner controls. Runtime-first deployment was verified before this ledger migration.
alter table public.ingestion_capacity_policy
  add column if not exists national_ingestion_enabled boolean not null default false,
  add column if not exists travel_priority_enabled boolean not null default true,
  add column if not exists tourism_priority_enabled boolean not null default true;

alter table public.national_ingestion_markets
  drop constraint if exists national_ingestion_markets_market_kind_check;
alter table public.national_ingestion_markets
  add constraint national_ingestion_markets_market_kind_check
  check (market_kind = any (array['city'::text,'state_fill'::text,'travel_corridor'::text,'tourism'::text]));

create or replace function public.owner_update_ingestion_capacity_policy(p_patch jsonb,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_uid uuid:=auth.uid(); v_before jsonb; v_after jsonb;
begin
 if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
 select to_jsonb(p) into v_before from public.ingestion_capacity_policy p where singleton=true for update;
 update public.ingestion_capacity_policy set
  idle_demand_enabled=coalesce((p_patch->>'idle_demand_enabled')::boolean,idle_demand_enabled),
  idle_min_interval_seconds=least(greatest(coalesce((p_patch->>'idle_min_interval_seconds')::integer,idle_min_interval_seconds),60),3600),
  quiet_min_interval_seconds=least(greatest(coalesce((p_patch->>'quiet_min_interval_seconds')::integer,quiet_min_interval_seconds),60),3600),
  active_min_interval_seconds=least(greatest(coalesce((p_patch->>'active_min_interval_seconds')::integer,active_min_interval_seconds),60),3600),
  tile_step_degrees=least(greatest(coalesce((p_patch->>'tile_step_degrees')::numeric,tile_step_degrees),0.02),1.0),
  max_tile_subdivision_level=least(greatest(coalesce((p_patch->>'max_tile_subdivision_level')::integer,max_tile_subdivision_level),0),8),
  max_parallel_tiles=least(greatest(coalesce((p_patch->>'max_parallel_tiles')::integer,max_parallel_tiles),1),8),
  canonical_batch_size=least(greatest(coalesce((p_patch->>'canonical_batch_size')::integer,canonical_batch_size),25),500),
  major_markets_enabled=coalesce((p_patch->>'major_markets_enabled')::boolean,major_markets_enabled),
  national_ingestion_enabled=coalesce((p_patch->>'national_ingestion_enabled')::boolean,national_ingestion_enabled),
  travel_priority_enabled=coalesce((p_patch->>'travel_priority_enabled')::boolean,travel_priority_enabled),
  tourism_priority_enabled=coalesce((p_patch->>'tourism_priority_enabled')::boolean,tourism_priority_enabled),
  updated_at=now(),updated_by=v_uid
 where singleton=true returning to_jsonb(public.ingestion_capacity_policy.*) into v_after;
 insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
 values(v_uid,'ingestion','update_capacity_policy','national_tile_engine',v_before,v_after,p_reason);
 return v_after;
end $function$;
revoke all on function public.owner_update_ingestion_capacity_policy(jsonb,text) from public,anon;
grant execute on function public.owner_update_ingestion_capacity_policy(jsonb,text) to authenticated,service_role;

with seed(market_key,name,state_code,market_kind,population_rank,priority,bbox) as (values
 ('national_boston','Boston / New England Gateway','MA','city',20,180,'[42.15,-71.35,42.55,-70.85]'::jsonb),
 ('national_dc_baltimore','Washington DC / Baltimore','DC','city',18,190,'[38.55,-77.35,39.45,-76.35]'::jsonb),
 ('national_miami','Miami / South Florida','FL','city',16,205,'[25.35,-80.65,26.35,-79.95]'::jsonb),
 ('national_orlando','Orlando / Central Florida','FL','city',17,210,'[28.20,-81.75,28.85,-80.95]'::jsonb),
 ('national_tampa','Tampa Bay','FL','city',22,175,'[27.55,-82.95,28.35,-82.15]'::jsonb),
 ('national_atlanta','Atlanta','GA','city',12,200,'[33.45,-84.85,34.15,-83.85]'::jsonb),
 ('national_nashville','Nashville','TN','city',25,180,'[35.85,-87.05,36.45,-86.25]'::jsonb),
 ('national_new_orleans','New Orleans','LA','city',28,175,'[29.65,-90.45,30.25,-89.65]'::jsonb),
 ('national_denver','Denver / Front Range','CO','city',14,205,'[39.35,-105.35,40.15,-104.45]'::jsonb),
 ('national_salt_lake','Salt Lake City','UT','city',30,165,'[40.35,-112.25,41.15,-111.55]'::jsonb),
 ('national_las_vegas','Las Vegas','NV','city',19,205,'[35.75,-115.55,36.45,-114.75]'::jsonb),
 ('national_seattle','Seattle / Puget Sound','WA','city',15,195,'[47.15,-122.65,47.95,-121.95]'::jsonb),
 ('national_portland','Portland','OR','city',24,170,'[45.25,-123.05,45.85,-122.25]'::jsonb),
 ('national_sf_bay','San Francisco Bay Area','CA','city',11,205,'[37.15,-122.75,38.15,-121.75]'::jsonb),
 ('national_detroit','Detroit','MI','city',23,170,'[42.05,-83.65,42.65,-82.75]'::jsonb),
 ('national_minneapolis','Minneapolis / St Paul','MN','city',21,170,'[44.65,-93.75,45.35,-92.75]'::jsonb),
 ('national_charlotte','Charlotte','NC','city',26,165,'[34.85,-81.15,35.55,-80.45]'::jsonb),
 ('national_austin','Austin','TX','city',13,185,'[30.05,-98.15,30.65,-97.35]'::jsonb),
 ('tourism_yellowstone','Yellowstone / Grand Teton','WY','tourism',1,260,'[43.45,-111.35,45.25,-109.75]'::jsonb),
 ('tourism_grand_canyon','Grand Canyon / Flagstaff','AZ','tourism',2,255,'[35.55,-113.05,36.65,-111.25]'::jsonb),
 ('tourism_smokies','Great Smoky Mountains / Gatlinburg','TN','tourism',3,250,'[35.35,-84.15,36.05,-82.75]'::jsonb),
 ('tourism_yosemite','Yosemite / Sierra Gateway','CA','tourism',4,245,'[37.15,-120.15,38.35,-118.95]'::jsonb),
 ('tourism_zion','Zion / St George','UT','tourism',5,240,'[36.65,-113.85,37.65,-112.55]'::jsonb),
 ('tourism_black_hills','Black Hills / Mount Rushmore','SD','tourism',6,230,'[43.55,-104.25,44.55,-102.75]'::jsonb),
 ('tourism_branson','Branson / Ozarks','MO','tourism',7,225,'[36.35,-94.15,37.25,-92.85]'::jsonb),
 ('travel_i95_northeast','I-95 Northeast Travel Belt','PA','travel_corridor',1,240,'[39.15,-77.45,42.15,-71.00]'::jsonb),
 ('travel_i95_southeast','I-95 Southeast Travel Belt','NC','travel_corridor',2,235,'[30.15,-82.35,36.85,-76.45]'::jsonb),
 ('travel_gulf_i10','I-10 Gulf Coast Travel Belt','LA','travel_corridor',3,225,'[29.15,-98.65,31.25,-81.15]'::jsonb),
 ('travel_mountain_i70','I-70 Mountain Travel Belt','CO','travel_corridor',4,230,'[38.75,-109.15,40.45,-102.05]'::jsonb),
 ('travel_southwest_i40','I-40 Southwest Travel Belt','NM','travel_corridor',5,220,'[34.15,-114.85,36.25,-96.85]'::jsonb)
)
insert into public.national_ingestion_markets(market_key,name,state_code,market_kind,population_rank,priority,bbox,status,source_progress)
select market_key,name,state_code,market_kind,population_rank,priority,bbox,'pending','{}'::jsonb from seed
on conflict(market_key) do update set
 name=excluded.name,state_code=excluded.state_code,market_kind=excluded.market_kind,
 population_rank=excluded.population_rank,priority=excluded.priority,bbox=excluded.bbox,
 status=case when public.national_ingestion_markets.status in ('blocked','running') then public.national_ingestion_markets.status else 'pending' end,
 updated_at=now();

update public.ingestion_capacity_policy set
 national_ingestion_enabled=true,travel_priority_enabled=true,tourism_priority_enabled=true,
 major_markets_enabled=true,updated_at=now() where singleton=true;


-- Activate the existing guarded focus scheduler for national priority markets.
create or replace function public.run_corridor_ingestion_scheduler()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare v_secret text; v_request_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='kleenest_maps_scheduler'
  limit 1;
  if v_secret is null then raise exception 'Kleenest scheduler secret is unavailable'; end if;
  select net.http_post(
    url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/focus-ingestion-orchestrator',
    headers := jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',v_secret),
    body := jsonb_build_object('action','cycle','scope','national_priority_markets'),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$function$;

select cron.alter_job(21, active := true);


-- National Overture queue is governed by the same Owner controls.
alter table public.place_discovery_hydration_queue
  add column if not exists owner_paused boolean not null default false;
create index if not exists place_discovery_hydration_queue_owner_work_idx
  on public.place_discovery_hydration_queue(owner_paused,status,priority,requested_at);

insert into public.place_discovery_hydration_queue(
  request_key,source_key,market_key,latitude,longitude,radius_meters,bbox,priority,status,owner_paused,requested_at,updated_at
)
select
  'market:'||m.market_key,'overture',m.market_key,
  ((m.bbox->>0)::double precision+(m.bbox->>2)::double precision)/2.0,
  ((m.bbox->>1)::double precision+(m.bbox->>3)::double precision)/2.0,
  40234,
  jsonb_build_array((m.bbox->>1)::double precision,(m.bbox->>0)::double precision,(m.bbox->>3)::double precision,(m.bbox->>2)::double precision),
  case m.market_kind when 'tourism' then 40 when 'travel_corridor' then 45 else 60 end,
  'pending',false,now(),now()
from public.national_ingestion_markets m
where (m.market_key like 'national_%' or m.market_key like 'tourism_%' or m.market_key like 'travel_%')
  and jsonb_typeof(m.bbox)='array' and jsonb_array_length(m.bbox)=4
on conflict(request_key) do update set
  source_key='overture',market_key=excluded.market_key,latitude=excluded.latitude,longitude=excluded.longitude,
  radius_meters=excluded.radius_meters,bbox=excluded.bbox,priority=excluded.priority,owner_paused=false,
  status=case when public.place_discovery_hydration_queue.status='running' then 'running' else 'pending' end,
  requested_at=now(),last_error=null,updated_at=now();

update public.national_ingestion_source_policies
set max_requests_per_cycle=4,updated_at=now()
where source_key='overture' and enabled=true;

create or replace function public.owner_update_ingestion_capacity_policy(p_patch jsonb,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_uid uuid:=auth.uid(); v_before jsonb; v_after jsonb;
begin
 if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
 select to_jsonb(p) into v_before from public.ingestion_capacity_policy p where singleton=true for update;
 update public.ingestion_capacity_policy set
  idle_demand_enabled=coalesce((p_patch->>'idle_demand_enabled')::boolean,idle_demand_enabled),
  idle_min_interval_seconds=least(greatest(coalesce((p_patch->>'idle_min_interval_seconds')::integer,idle_min_interval_seconds),60),3600),
  quiet_min_interval_seconds=least(greatest(coalesce((p_patch->>'quiet_min_interval_seconds')::integer,quiet_min_interval_seconds),60),3600),
  active_min_interval_seconds=least(greatest(coalesce((p_patch->>'active_min_interval_seconds')::integer,active_min_interval_seconds),60),3600),
  tile_step_degrees=least(greatest(coalesce((p_patch->>'tile_step_degrees')::numeric,tile_step_degrees),0.02),1.0),
  max_tile_subdivision_level=least(greatest(coalesce((p_patch->>'max_tile_subdivision_level')::integer,max_tile_subdivision_level),0),8),
  max_parallel_tiles=least(greatest(coalesce((p_patch->>'max_parallel_tiles')::integer,max_parallel_tiles),1),8),
  canonical_batch_size=least(greatest(coalesce((p_patch->>'canonical_batch_size')::integer,canonical_batch_size),25),500),
  major_markets_enabled=coalesce((p_patch->>'major_markets_enabled')::boolean,major_markets_enabled),
  national_ingestion_enabled=coalesce((p_patch->>'national_ingestion_enabled')::boolean,national_ingestion_enabled),
  travel_priority_enabled=coalesce((p_patch->>'travel_priority_enabled')::boolean,travel_priority_enabled),
  tourism_priority_enabled=coalesce((p_patch->>'tourism_priority_enabled')::boolean,tourism_priority_enabled),
  updated_at=now(),updated_by=v_uid
 where singleton=true returning to_jsonb(public.ingestion_capacity_policy.*) into v_after;
 if p_patch ? 'national_ingestion_enabled' then
   update public.place_discovery_hydration_queue set owner_paused=not (p_patch->>'national_ingestion_enabled')::boolean,updated_at=now()
   where market_key like 'national_%' or market_key like 'travel_%' or market_key like 'tourism_%';
 end if;
 if p_patch ? 'travel_priority_enabled' then
   update public.place_discovery_hydration_queue set owner_paused=not (p_patch->>'travel_priority_enabled')::boolean,updated_at=now()
   where market_key like 'travel_%';
 end if;
 if p_patch ? 'tourism_priority_enabled' then
   update public.place_discovery_hydration_queue set owner_paused=not (p_patch->>'tourism_priority_enabled')::boolean,updated_at=now()
   where market_key like 'tourism_%';
 end if;
 insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
 values(v_uid,'ingestion','update_capacity_policy','national_tile_engine',v_before,v_after,p_reason);
 return v_after;
end $function$;

create or replace function public.owner_update_ingestion_market(p_market_id uuid,p_priority integer default null,p_enabled boolean default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_uid uuid:=auth.uid(); v_before jsonb; v_after jsonb; v_status text; v_key text;
begin
 if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
 select to_jsonb(m),m.status,m.market_key into v_before,v_status,v_key from public.national_ingestion_markets m where m.id=p_market_id;
 if v_before is null then raise exception 'Ingestion market not found'; end if;
 if p_enabled=false and v_status='running' then raise exception 'A running market cannot be disabled until the current cycle completes'; end if;
 update public.national_ingestion_markets set
  priority=coalesce(least(greatest(p_priority,1),100000),priority),
  status=case when p_enabled=false then 'blocked' when p_enabled=true and status='blocked' then 'pending' else status end,
  last_error=case when p_enabled=true and status='blocked' then null else last_error end,updated_at=now()
 where id=p_market_id returning to_jsonb(public.national_ingestion_markets.*) into v_after;
 if p_enabled is not null then
   update public.place_discovery_hydration_queue set owner_paused=not p_enabled,updated_at=now() where market_key=v_key;
 end if;
 insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
 values(v_uid,'ingestion','update_market',p_market_id::text,v_before,v_after,p_reason);
 return v_after;
end $function$;

revoke all on function public.owner_update_ingestion_capacity_policy(jsonb,text) from public,anon;
grant execute on function public.owner_update_ingestion_capacity_policy(jsonb,text) to authenticated,service_role;
revoke all on function public.owner_update_ingestion_market(uuid,integer,boolean,text) from public,anon;
grant execute on function public.owner_update_ingestion_market(uuid,integer,boolean,text) to authenticated,service_role;

select cron.alter_job(21, schedule := '*/10 * * * *', active := true);
