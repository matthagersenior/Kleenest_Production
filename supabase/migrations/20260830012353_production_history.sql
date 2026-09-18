alter table public.offline_pack_events add column if not exists metadata jsonb not null default '{}'::jsonb;

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
security invoker
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare
  v_user uuid:=auth.uid();
  v_existing public.offline_pack_events;
  v_stop public.fleet_route_stops;
  v_payload jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_client_event_id is null or btrim(p_client_event_id)='' then raise exception 'client_event_id is required'; end if;
  if not exists(select 1 from public.offline_packs p where p.id=p_pack_id and p.user_id=v_user) then raise exception 'Offline pack access denied'; end if;
  select * into v_existing from public.offline_pack_events where client_event_id=p_client_event_id;
  if found then
    return jsonb_build_object('already_synced',true,'event_id',v_existing.id,'synced_at',v_existing.synced_at,'metadata',v_existing.metadata);
  end if;
  select * into v_stop from public.fleet_record_route_stop_timing(p_business_id,p_route_id,p_route_stop_id,p_event_type,coalesce(p_occurred_at,now()));
  v_payload:=jsonb_build_object('businessId',p_business_id,'routeId',p_route_id,'routeStopId',p_route_stop_id,'eventType',p_event_type,'occurredAt',p_occurred_at);
  insert into public.offline_pack_events(pack_id,user_id,event_type,payload,client_event_id,created_at,synced_at,actor_id,attempt_count,last_attempt_at,sync_error,metadata)
  values(p_pack_id,v_user,'fleet.route_stop_timing',v_payload,p_client_event_id,now(),now(),v_user,1,now(),null,jsonb_build_object('authoritative_replay',true,'result',to_jsonb(v_stop)))
  returning * into v_existing;
  return jsonb_build_object('already_synced',false,'event_id',v_existing.id,'synced_at',v_existing.synced_at,'result',to_jsonb(v_stop));
end $$;
revoke execute on function public.fleet_replay_route_stop_timing(uuid,uuid,uuid,uuid,text,timestamptz,text) from public,anon;
grant execute on function public.fleet_replay_route_stop_timing(uuid,uuid,uuid,uuid,text,timestamptz,text) to authenticated;
