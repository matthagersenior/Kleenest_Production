-- Canonical Fleet offline route-stop recovery contract.
-- Mirrors the live authenticated functions so mobile replay cannot drift from server pack ownership/idempotency semantics.

create or replace function public.create_offline_pack(
  p_pack_type text,
  p_name text default null,
  p_business_id uuid default null,
  p_route_discovery_session_id uuid default null,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null,
  p_expires_hours integer default 24
)
returns public.offline_packs
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_pack public.offline_packs;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_pack_type='business' and (
    p_business_id is null or not exists(
      select 1 from public.business_members bm
      where bm.business_id=p_business_id and bm.user_id=v_user
    )
  ) then raise exception 'business pack access denied'; end if;
  if p_pack_type='route' and (
    p_route_discovery_session_id is null or not exists(
      select 1 from public.route_discovery_sessions r
      where r.id=p_route_discovery_session_id and r.user_id=v_user
    )
  ) then raise exception 'route pack access denied'; end if;

  insert into public.offline_packs(
    user_id,pack_type,name,business_id,route_discovery_session_id,
    west,south,east,north,status,expires_at
  ) values(
    v_user,p_pack_type,p_name,p_business_id,p_route_discovery_session_id,
    p_west,p_south,p_east,p_north,'preparing',
    now()+make_interval(hours=>greatest(1,least(coalesce(p_expires_hours,24),168)))
  ) returning * into v_pack;

  insert into public.offline_pack_locations(pack_id,location_id,snapshot)
  select v_pack.id,l.id,jsonb_build_object(
    'id',l.id,'name',l.name,'latitude',l.latitude,'longitude',l.longitude,
    'category',l.category,'address',l.address,'amenities',l.amenities,
    'is_verified',l.is_verified,
    'bathroom_verification_status',l.bathroom_verification_status
  )
  from public.locations l
  where (
    p_route_discovery_session_id is not null and exists(
      select 1 from public.route_discovery_locations r
      where r.session_id=p_route_discovery_session_id and r.location_id=l.id
    )
  ) or (
    p_west is not null and l.longitude between p_west and p_east
    and l.latitude between p_south and p_north
  );

  if p_business_id is not null then
    insert into public.offline_pack_businesses(pack_id,business_id,snapshot)
    select v_pack.id,b.id,to_jsonb(b)
    from public.businesses b where b.id=p_business_id
    on conflict do nothing;
  end if;

  update public.offline_packs
  set status='ready',updated_at=now()
  where id=v_pack.id
  returning * into v_pack;
  return v_pack;
end;
$function$;

create or replace function public.fleet_replay_route_stop_timing(
  p_pack_id uuid,
  p_business_id uuid,
  p_route_id uuid,
  p_route_stop_id uuid,
  p_event_type text,
  p_occurred_at timestamptz,
  p_client_event_id text
)
returns jsonb
language plpgsql
set search_path to 'public', 'auth', 'extensions', 'pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_existing public.offline_pack_events;
  v_stop public.fleet_route_stops;
  v_payload jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_client_event_id is null or btrim(p_client_event_id)='' then raise exception 'client_event_id is required'; end if;
  if not exists(
    select 1 from public.offline_packs p
    where p.id=p_pack_id and p.user_id=v_user
  ) then raise exception 'Offline pack access denied'; end if;

  select * into v_existing
  from public.offline_pack_events
  where client_event_id=p_client_event_id;
  if found then
    return jsonb_build_object(
      'already_synced',true,
      'event_id',v_existing.id,
      'synced_at',v_existing.synced_at,
      'metadata',v_existing.metadata
    );
  end if;

  select * into v_stop
  from public.fleet_record_route_stop_timing(
    p_business_id,p_route_id,p_route_stop_id,p_event_type,coalesce(p_occurred_at,now())
  );
  v_payload:=jsonb_build_object(
    'businessId',p_business_id,'routeId',p_route_id,'routeStopId',p_route_stop_id,
    'eventType',p_event_type,'occurredAt',p_occurred_at
  );
  insert into public.offline_pack_events(
    pack_id,user_id,event_type,payload,client_event_id,created_at,synced_at,
    actor_id,attempt_count,last_attempt_at,sync_error,metadata
  ) values(
    p_pack_id,v_user,'fleet.route_stop_timing',v_payload,p_client_event_id,
    now(),now(),v_user,1,now(),null,
    jsonb_build_object('authoritative_replay',true,'result',to_jsonb(v_stop))
  ) returning * into v_existing;

  return jsonb_build_object(
    'already_synced',false,
    'event_id',v_existing.id,
    'synced_at',v_existing.synced_at,
    'result',to_jsonb(v_stop)
  );
end;
$function$;

revoke all on function public.create_offline_pack(text,text,uuid,uuid,double precision,double precision,double precision,double precision,integer) from public, anon;
revoke all on function public.fleet_replay_route_stop_timing(uuid,uuid,uuid,uuid,text,timestamptz,text) from public, anon;
grant execute on function public.create_offline_pack(text,text,uuid,uuid,double precision,double precision,double precision,double precision,integer) to authenticated, service_role;
grant execute on function public.fleet_replay_route_stop_timing(uuid,uuid,uuid,uuid,text,timestamptz,text) to authenticated, service_role;
