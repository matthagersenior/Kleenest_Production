-- Route-stop geofences drive Fleet operations and notifications.
-- Restrict those events to a Fleet manager or the route's assigned driver while
-- preserving the existing consumer/business geofence behavior.

create or replace function public.record_geofence_event(
  p_geofence_id uuid,
  p_user_id uuid,
  p_location_id uuid,
  p_business_id uuid,
  p_event_type text,
  p_dwell_seconds integer default null,
  p_metadata jsonb default '{}'::jsonb,
  p_notification_id uuid default null,
  p_qr_code_id uuid default null,
  p_check_in_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  g public.business_geofences;
  s public.fleet_route_stops;
  r public.fleet_routes;
  v_assigned_driver boolean:=false;
  v_event text:=lower(trim(coalesce(p_event_type,'')));
  v_notify boolean:=false;
  v_title text;
  v_body text;
  v_notification_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_user_id is distinct from auth.uid() then raise exception 'user identity mismatch'; end if;
  if p_geofence_id is null then raise exception 'geofence required'; end if;

  select * into g
  from public.business_geofences
  where id=p_geofence_id and coalesce(active,true);
  if not found then raise exception 'geofence scope mismatch'; end if;
  if p_business_id is not null and g.business_id is distinct from p_business_id then raise exception 'geofence scope mismatch'; end if;

  if g.route_stop_id is null then
    if p_location_id is null or g.location_id is distinct from p_location_id then
      raise exception 'geofence and location required';
    end if;
  else
    select * into s from public.fleet_route_stops where id=g.route_stop_id;
    if not found then raise exception 'Fleet route stop not found'; end if;
    select * into r from public.fleet_routes where id=s.route_id and business_id=s.business_id;
    if not found then raise exception 'Fleet route not found'; end if;

    if r.driver_id is not null then
      select exists(
        select 1 from public.fleet_drivers d
        where d.id=r.driver_id
          and d.business_id=s.business_id
          and d.user_id=auth.uid()
      ) into v_assigned_driver;
    end if;
    if not public.fleet_actor_is_manager(s.business_id) and not v_assigned_driver then
      raise exception 'Fleet manager or assigned driver access required';
    end if;

    if p_location_id is not null and g.location_id is not null and g.location_id is distinct from p_location_id then
      raise exception 'geofence scope mismatch';
    end if;
  end if;

  insert into public.geofence_events(
    geofence_id,user_id,location_id,business_id,event_type,dwell_seconds,metadata,
    notification_id,qr_code_id,check_in_id
  )
  values(
    p_geofence_id,auth.uid(),coalesce(p_location_id,g.location_id),coalesce(p_business_id,g.business_id),
    p_event_type,p_dwell_seconds,
    coalesce(p_metadata,'{}'::jsonb)||case when g.route_stop_id is null then '{}'::jsonb else jsonb_build_object('route_stop_id',g.route_stop_id) end,
    p_notification_id,p_qr_code_id,p_check_in_id
  )
  returning id into v_id;

  if g.route_stop_id is not null then
    insert into public.fleet_operational_events(
      business_id,vehicle_id,driver_id,route_id,event_type,latitude,longitude,occurred_at,metadata
    )
    values(
      s.business_id,r.vehicle_id,r.driver_id,s.route_id,'route_stop_geofence_'||v_event,
      coalesce(s.latitude,g.latitude),coalesce(s.longitude,g.longitude),now(),
      jsonb_build_object(
        'route_stop_id',s.id,'stop_order',s.stop_order,'location_id',s.location_id,
        'stop_kind',s.stop_kind,'stop_name',s.stop_name,'geofence_id',g.id,
        'dwell_seconds',p_dwell_seconds,'geofence_event_id',v_id
      )
    );

    if v_event in ('enter','entered','entry') and s.notify_arrival then
      v_notify:=true; v_title:='Approaching route stop'; v_body:=coalesce(s.stop_name,'Route stop')||' geofence entered.';
    elsif v_event in ('exit','exited') and s.notify_departure then
      v_notify:=true; v_title:='Departing route stop'; v_body:=coalesce(s.stop_name,'Route stop')||' geofence exited.';
    elsif v_event like '%dwell%' and s.notify_dwell then
      v_notify:=true; v_title:='Route stop dwell'; v_body:=coalesce(s.stop_name,'Route stop')||' dwell threshold reached.';
    end if;

    if v_notify and g.notification_enabled then
      select public.publish_fleet_route_notification(
        s.route_id,
        'route_stop_geofence_'||v_event,
        v_title,
        v_body,
        jsonb_build_object(
          'route_stop_id',s.id,'location_id',s.location_id,'stop_order',s.stop_order,
          'stop_kind',s.stop_kind,'geofence_id',g.id,'geofence_event_id',v_id,
          'dedupe_key','fleet:'||s.route_id::text||':geofence:'||v_id::text
        )
      ) into v_notification_id;
      if v_notification_id is not null then
        update public.geofence_events set notification_id=v_notification_id where id=v_id;
      end if;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_geofence_event(uuid,uuid,uuid,uuid,text,integer,jsonb,uuid,uuid,uuid) from public,anon;
grant execute on function public.record_geofence_event(uuid,uuid,uuid,uuid,text,integer,jsonb,uuid,uuid,uuid) to authenticated,service_role;

comment on function public.record_geofence_event(uuid,uuid,uuid,uuid,text,integer,jsonb,uuid,uuid,uuid) is
  'Records canonical geofence events; Fleet route-stop geofences additionally require a Fleet manager or assigned driver and converge into Fleet operational intelligence.';
