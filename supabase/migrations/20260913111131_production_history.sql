-- Follow-up hardening for the Fleet client workspace authority.
-- Keep relationship helpers internal and make the active dwell/stall watchdog
-- emit one durable alert per route stop instead of repeatedly re-materializing.

revoke execute on function public.fleet_user_has_workspace_access(uuid) from authenticated;
grant execute on function public.fleet_user_has_workspace_access(uuid) to service_role;

create or replace function public.materialize_fleet_active_dwell_exceptions()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  rec record;
  v_threshold_minutes integer;
  v_dwell_seconds integer;
  v_alert_id uuid;
  v_notification_id uuid;
  v_count integer:=0;
begin
  for rec in
    select
      s.id route_stop_id,
      s.business_id,
      s.route_id,
      s.stop_order,
      coalesce(s.stop_name,'Route stop') stop_name,
      s.planned_dwell_minutes,
      r.driver_id,
      r.vehicle_id,
      d.user_id driver_user_id,
      g.id geofence_id,
      e.id entry_event_id,
      e.user_id entry_user_id,
      e.occurred_at entered_at,
      coalesce(p.geofence_dwell_minutes,30) geofence_dwell_minutes,
      coalesce(p.dwell_overrun_minutes,10) dwell_overrun_minutes
    from public.fleet_route_stops s
    join public.fleet_routes r
      on r.id=s.route_id and r.business_id=s.business_id
    join public.business_geofences g
      on g.route_stop_id=s.id and g.business_id=s.business_id and coalesce(g.active,true)
    left join public.fleet_drivers d
      on d.id=r.driver_id and d.business_id=r.business_id
    left join public.fleet_exception_policies p
      on p.business_id=s.business_id
    join lateral (
      select ge.id,ge.user_id,ge.occurred_at
      from public.geofence_events ge
      where ge.geofence_id=g.id
        and lower(ge.event_type) in ('enter','entered','entry')
      order by ge.occurred_at desc
      limit 1
    ) e on true
    where s.notify_dwell
      and r.status in ('active','paused')
      and s.status not in ('completed','skipped','cancelled')
      and not exists(
        select 1
        from public.geofence_events gx
        where gx.geofence_id=g.id
          and gx.occurred_at>e.occurred_at
          and lower(gx.event_type) in ('exit','exited')
      )
      and not exists(
        select 1
        from public.fleet_alerts existing_alert
        where existing_alert.business_id=s.business_id
          and existing_alert.source_kind='fleet_route_stop'
          and existing_alert.source_id=s.id
          and existing_alert.alert_type='route_stop_stall'
      )
  loop
    v_threshold_minutes:=greatest(
      1,
      rec.geofence_dwell_minutes,
      coalesce(rec.planned_dwell_minutes,0)+rec.dwell_overrun_minutes
    );
    v_dwell_seconds:=greatest(0,floor(extract(epoch from(now()-rec.entered_at)))::integer);

    if v_dwell_seconds < v_threshold_minutes*60 then
      continue;
    end if;

    v_alert_id:=public.materialize_fleet_exception_alert(
      rec.business_id,
      rec.vehicle_id,
      'route_stop_stall',
      'Fleet stop stall / dwell threshold',
      rec.stop_name||' has remained inside its route geofence for '||
        greatest(1,round(v_dwell_seconds/60.0))::text||' minutes.',
      'warning',
      'fleet_route_stop',
      rec.route_stop_id
    );

    if rec.driver_user_id is not null then
      select ne.id into v_notification_id
      from public.notification_events ne
      where ne.dedupe_key='fleet-exception:'||v_alert_id::text
      order by ne.created_at desc
      limit 1;

      if v_notification_id is not null then
        insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
        values
          (v_notification_id,rec.driver_user_id,'in_app'),
          (v_notification_id,rec.driver_user_id,'push')
        on conflict(notification_id,recipient_user_id,channel) do nothing;
      end if;
    end if;

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.materialize_fleet_active_dwell_exceptions() from public,anon,authenticated;
grant execute on function public.materialize_fleet_active_dwell_exceptions() to service_role;

comment on function public.fleet_user_has_workspace_access(uuid) is
  'Internal relationship-aware Fleet workspace helper. Called by signed-in security-definer RPCs; not directly exposed to authenticated API clients.';
comment on function public.materialize_fleet_active_dwell_exceptions() is
  'Server-side Fleet active dwell/stall watchdog. Emits one durable route-stop stall alert and assigned-driver delivery per route stop after the configured threshold.';
