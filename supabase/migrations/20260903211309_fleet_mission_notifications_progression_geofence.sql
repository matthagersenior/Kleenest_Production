insert into public.progression_actions(code,label,points,enabled)
values ('fleet_stop_complete','Fleet route stop completed',5,true)
on conflict(code) do update set label=excluded.label, points=excluded.points, enabled=true;

create or replace function public.publish_fleet_route_notification(
  p_route_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare
  v_route public.fleet_routes%rowtype;
  v_event uuid;
  v_allowed boolean;
  v_dedupe text;
begin
  select * into v_route from public.fleet_routes where id=p_route_id;
  if not found then raise exception 'fleet route not found'; end if;

  v_allowed:=public.fleet_actor_is_manager(v_route.business_id)
    or exists(
      select 1 from public.fleet_drivers d
      where d.id=v_route.driver_id and d.business_id=v_route.business_id and d.user_id=auth.uid()
    );
  if not v_allowed then raise exception 'Fleet manager or assigned driver authorization required'; end if;

  v_dedupe:=coalesce(nullif(p_payload->>'dedupe_key',''), 'fleet:'||p_route_id::text||':'||p_event_type||':'||date_trunc('minute',now())::text);

  insert into public.fleet_route_updates(route_id,update_type,actor_user_id,payload)
  values(p_route_id,p_event_type,auth.uid(),coalesce(p_payload,'{}'::jsonb));

  insert into public.notification_events(event_type,actor_user_id,location_id,audience_scope,payload,dedupe_key,expires_at)
  values(
    p_event_type,
    auth.uid(),
    null,
    'fleet',
    jsonb_build_object('title',p_title,'body',p_body,'fleet_route_id',p_route_id,'business_id',v_route.business_id)||coalesce(p_payload,'{}'::jsonb),
    v_dedupe,
    now()+interval '24 hours'
  )
  on conflict(dedupe_key) where dedupe_key is not null
  do update set payload=excluded.payload,created_at=now(),expires_at=excluded.expires_at
  returning id into v_event;

  insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
  select v_event, recipients.user_id, channels.channel
  from (
    select bm.user_id from public.business_members bm where bm.business_id=v_route.business_id
    union
    select d.user_id from public.fleet_drivers d where d.id=v_route.driver_id and d.user_id is not null
  ) recipients
  cross join (values ('in_app'::text),('push'::text)) channels(channel)
  on conflict(notification_id,recipient_user_id,channel) do nothing;

  return v_event;
end;
$function$;

grant execute on function public.publish_fleet_route_notification(uuid,text,text,text,jsonb) to authenticated, service_role;

create or replace function public.fleet_record_route_stop_timing(
  p_business_id uuid,
  p_route_id uuid,
  p_route_stop_id uuid,
  p_event_type text,
  p_occurred_at timestamptz default now()
)
returns public.fleet_route_stops
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s public.fleet_route_stops;
  r public.fleet_routes;
  v_now timestamptz := coalesce(p_occurred_at,now());
  v_assigned_driver boolean := false;
  v_remaining integer;
  v_rows integer;
  v_notification_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into r from public.fleet_routes where id=p_route_id and business_id=p_business_id;
  if not found then raise exception 'Route not found'; end if;
  if r.driver_id is not null then
    select exists(select 1 from public.fleet_drivers d where d.id=r.driver_id and d.business_id=p_business_id and d.user_id=auth.uid()) into v_assigned_driver;
  end if;
  if not public.fleet_actor_is_manager(p_business_id) and not v_assigned_driver then raise exception 'Fleet manager or assigned driver access required'; end if;

  select * into s from public.fleet_route_stops where id=p_route_stop_id and route_id=p_route_id and business_id=p_business_id for update;
  if not found then raise exception 'Fleet route stop not found'; end if;

  if p_event_type='arrived' then
    update public.fleet_route_stops set status='arrived',actual_arrived_at=coalesce(actual_arrived_at,v_now),updated_at=now() where id=s.id;
  elsif p_event_type='service_started' then
    update public.fleet_route_stops set status='servicing',actual_arrived_at=coalesce(actual_arrived_at,v_now),actual_service_started_at=coalesce(actual_service_started_at,v_now),updated_at=now() where id=s.id;
  elsif p_event_type='completed' then
    update public.fleet_route_stops set status='completed',actual_arrived_at=coalesce(actual_arrived_at,v_now),actual_service_started_at=coalesce(actual_service_started_at,v_now),actual_completed_at=coalesce(actual_completed_at,v_now),actual_departed_at=coalesce(actual_departed_at,v_now),updated_at=now() where id=s.id;
  elsif p_event_type='departed' then
    update public.fleet_route_stops set status=case when actual_completed_at is null then status else 'completed' end,actual_departed_at=coalesce(actual_departed_at,v_now),updated_at=now() where id=s.id;
  elsif p_event_type='skipped' then
    update public.fleet_route_stops set status='skipped',actual_departed_at=coalesce(actual_departed_at,v_now),updated_at=now() where id=s.id;
  else
    raise exception 'Unsupported stop timing event';
  end if;

  select * into s from public.fleet_route_stops where id=s.id;

  insert into public.fleet_operational_events(business_id,vehicle_id,driver_id,route_id,event_type,occurred_at,metadata)
  values(p_business_id,r.vehicle_id,r.driver_id,p_route_id,'route_stop_'||p_event_type,v_now,jsonb_build_object('route_stop_id',s.id,'stop_order',s.stop_order,'location_id',s.location_id,'actor_user_id',auth.uid()));

  if p_event_type in ('arrived','service_started','completed') then
    select public.publish_fleet_route_notification(
      p_route_id,
      'route_stop_'||p_event_type,
      case p_event_type when 'arrived' then 'Driver arrived' when 'service_started' then 'Stop work started' else 'Route stop completed' end,
      'Fleet route '||coalesce(r.name,'route')||' · stop '||s.stop_order::text||' '||replace(p_event_type,'_',' '),
      jsonb_build_object('route_stop_id',s.id,'location_id',s.location_id,'stop_order',s.stop_order,'dedupe_key','fleet:'||p_route_id::text||':stop:'||s.id::text||':'||p_event_type)
    ) into v_notification_id;
  end if;

  if p_event_type='completed' then
    perform public.record_progression_metric_event(
      'fleet_stop_complete','fleet_route_stop',s.id,1,null,
      jsonb_build_object('business_id',p_business_id,'route_id',p_route_id,'location_id',s.location_id,'idempotency_key','fleet-stop-complete:'||s.id::text)
    );
  end if;

  if p_event_type in ('completed','skipped') then
    select count(*) into v_remaining from public.fleet_route_stops where route_id=p_route_id and status not in ('completed','skipped','cancelled');
    if v_remaining=0 then
      update public.fleet_routes
      set status='completed',actual_completed_at=coalesce(actual_completed_at,v_now),dispatch_locked=true,updated_at=now()
      where id=p_route_id and business_id=p_business_id and status not in ('completed','cancelled');
      get diagnostics v_rows = row_count;
      if v_rows>0 then
        insert into public.fleet_operational_events(business_id,vehicle_id,driver_id,route_id,event_type,occurred_at,metadata)
        values(p_business_id,r.vehicle_id,r.driver_id,p_route_id,'route_completed',v_now,jsonb_build_object('completion_source','all_stops_terminal','actor_user_id',auth.uid()));
        perform public.record_progression_metric_event(
          'route_complete','fleet_route',p_route_id,1,null,
          jsonb_build_object('business_id',p_business_id,'idempotency_key','fleet-route-complete:'||p_route_id::text)
        );
        select public.publish_fleet_route_notification(
          p_route_id,'route_completed','Route completed','Fleet route '||coalesce(r.name,'route')||' is complete.',
          jsonb_build_object('dedupe_key','fleet:'||p_route_id::text||':route_completed')
        ) into v_notification_id;
      end if;
    end if;
  end if;

  return s;
end;
$function$;

grant execute on function public.fleet_record_route_stop_timing(uuid,uuid,uuid,text,timestamptz) to authenticated, service_role;

create or replace function public.sync_fleet_route_stop_from_geofence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_stop_id uuid;
  v_route_id uuid;
  v_business_id uuid;
  v_timing_event text;
begin
  if new.location_id is null or new.user_id is null then return new; end if;
  v_timing_event := case lower(coalesce(new.event_type,''))
    when 'enter' then 'arrived'
    when 'entered' then 'arrived'
    when 'arrival' then 'arrived'
    when 'arrived' then 'arrived'
    when 'exit' then 'departed'
    when 'exited' then 'departed'
    when 'departure' then 'departed'
    when 'departed' then 'departed'
    else null
  end;
  if v_timing_event is null then return new; end if;

  select s.id,r.id,r.business_id into v_stop_id,v_route_id,v_business_id
  from public.fleet_route_stops s
  join public.fleet_routes r on r.id=s.route_id and r.business_id=s.business_id
  join public.fleet_drivers d on d.id=r.driver_id and d.business_id=r.business_id
  where s.location_id=new.location_id
    and d.user_id=new.user_id
    and r.status in ('active','in_progress','dispatched')
    and s.status not in ('skipped','cancelled')
  order by s.stop_order
  limit 1;

  if v_stop_id is not null then
    perform public.fleet_record_route_stop_timing(v_business_id,v_route_id,v_stop_id,v_timing_event,coalesce(new.occurred_at,new.created_at,now()));
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sync_fleet_route_stop_from_geofence on public.geofence_events;
create trigger trg_sync_fleet_route_stop_from_geofence
after insert on public.geofence_events
for each row execute function public.sync_fleet_route_stop_from_geofence();
