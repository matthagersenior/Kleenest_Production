create table if not exists public.fleet_exception_policies(
 business_id uuid primary key,
 late_stop_minutes integer not null default 10 check(late_stop_minutes between 1 and 240),
 dwell_overrun_minutes integer not null default 10 check(dwell_overrun_minutes between 1 and 240),
 geofence_dwell_minutes integer not null default 30 check(geofence_dwell_minutes between 1 and 1440),
 notify_warning boolean not null default true,
 notify_critical boolean not null default true,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
alter table public.fleet_exception_policies enable row level security;
grant select on public.fleet_exception_policies to authenticated;
revoke all on public.fleet_exception_policies from anon;
drop policy if exists fleet_exception_policies_select on public.fleet_exception_policies;
create policy fleet_exception_policies_select on public.fleet_exception_policies for select to authenticated using (public.fleet_observe_access(business_id));

alter table public.fleet_alerts add column if not exists source_kind text;
alter table public.fleet_alerts add column if not exists source_id uuid;
create unique index if not exists fleet_alerts_source_uidx on public.fleet_alerts(business_id,source_kind,source_id,alert_type) where source_id is not null;

create or replace function public.fleet_exception_policy(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','auth','extensions','pg_temp' as $$
declare p public.fleet_exception_policies;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
 select * into p from public.fleet_exception_policies where business_id=p_business_id;
 return jsonb_build_object('business_id',p_business_id,'late_stop_minutes',coalesce(p.late_stop_minutes,10),'dwell_overrun_minutes',coalesce(p.dwell_overrun_minutes,10),'geofence_dwell_minutes',coalesce(p.geofence_dwell_minutes,30),'notify_warning',coalesce(p.notify_warning,true),'notify_critical',coalesce(p.notify_critical,true),'updated_at',p.updated_at);
end $$;
revoke all on function public.fleet_exception_policy(uuid) from public,anon;
grant execute on function public.fleet_exception_policy(uuid) to authenticated;

create or replace function public.fleet_update_exception_policy(p_business_id uuid,p_late_stop_minutes integer,p_dwell_overrun_minutes integer,p_geofence_dwell_minutes integer,p_notify_warning boolean,p_notify_critical boolean)
returns jsonb language plpgsql security definer set search_path='public','auth','extensions','pg_temp' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager permission required'; end if;
 if coalesce(p_late_stop_minutes,0) not between 1 and 240 then raise exception 'Late-stop threshold out of range'; end if;
 if coalesce(p_dwell_overrun_minutes,0) not between 1 and 240 then raise exception 'Dwell-overrun threshold out of range'; end if;
 if coalesce(p_geofence_dwell_minutes,0) not between 1 and 1440 then raise exception 'Geofence-dwell threshold out of range'; end if;
 insert into public.fleet_exception_policies(business_id,late_stop_minutes,dwell_overrun_minutes,geofence_dwell_minutes,notify_warning,notify_critical,updated_at,updated_by)
 values(p_business_id,p_late_stop_minutes,p_dwell_overrun_minutes,p_geofence_dwell_minutes,coalesce(p_notify_warning,true),coalesce(p_notify_critical,true),now(),auth.uid())
 on conflict(business_id) do update set late_stop_minutes=excluded.late_stop_minutes,dwell_overrun_minutes=excluded.dwell_overrun_minutes,geofence_dwell_minutes=excluded.geofence_dwell_minutes,notify_warning=excluded.notify_warning,notify_critical=excluded.notify_critical,updated_at=now(),updated_by=auth.uid();
 return public.fleet_exception_policy(p_business_id);
end $$;
revoke all on function public.fleet_update_exception_policy(uuid,integer,integer,integer,boolean,boolean) from public,anon;
grant execute on function public.fleet_update_exception_policy(uuid,integer,integer,integer,boolean,boolean) to authenticated;

create or replace function public.materialize_fleet_exception_alert(p_business_id uuid,p_vehicle_id uuid,p_alert_type text,p_title text,p_details text,p_severity text,p_source_kind text,p_source_id uuid)
returns uuid language plpgsql security definer set search_path='public','auth','extensions','pg_temp' as $$
declare v_alert uuid; v_event uuid; v_notify boolean:=true; v_policy public.fleet_exception_policies;
begin
 select * into v_policy from public.fleet_exception_policies where business_id=p_business_id;
 if p_severity='critical' then v_notify:=coalesce(v_policy.notify_critical,true); else v_notify:=coalesce(v_policy.notify_warning,true); end if;
 insert into public.fleet_alerts(business_id,vehicle_id,severity,alert_type,title,details,status,source_kind,source_id)
 values(p_business_id,p_vehicle_id,p_severity,p_alert_type,p_title,p_details,'open',p_source_kind,p_source_id)
 on conflict(business_id,source_kind,source_id,alert_type) where source_id is not null do update set title=excluded.title,details=excluded.details,severity=excluded.severity
 returning id into v_alert;
 if v_notify then
  insert into public.notification_events(event_type,audience_scope,payload,dedupe_key,expires_at)
  values('fleet_exception_alert','fleet',jsonb_build_object('title',p_title,'body',p_details,'business_id',p_business_id,'alert_id',v_alert,'alert_type',p_alert_type,'severity',p_severity,'source_kind',p_source_kind,'source_id',p_source_id,'surface','fleet','exception_alert',true),'fleet-exception:'||v_alert::text,now()+interval '7 days')
  on conflict(dedupe_key) where dedupe_key is not null do update set payload=excluded.payload,expires_at=excluded.expires_at returning id into v_event;
  insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
  select v_event,m.user_id,c.channel from public.app_business_memberships m cross join (values('in_app'::text),('push'::text)) c(channel)
  where m.business_id=p_business_id and m.role::text in ('owner','admin','manager','staff')
  on conflict(notification_id,recipient_user_id,channel) do nothing;
  perform public.materialize_notification_event(v_event);
  perform public.queue_push_deliveries_for_notification(v_event);
 end if;
 return v_alert;
end $$;
revoke all on function public.materialize_fleet_exception_alert(uuid,uuid,text,text,text,text,text,uuid) from public,anon,authenticated;

create or replace function public.evaluate_fleet_operational_exception()
returns trigger language plpgsql security definer set search_path='public','auth','extensions','pg_temp' as $$
declare p public.fleet_exception_policies; s public.fleet_route_stops; late_minutes numeric; dwell_minutes numeric;
begin
 select * into p from public.fleet_exception_policies where business_id=new.business_id;
 if new.event_type in ('route_failed','job_failed') then
  perform public.materialize_fleet_exception_alert(new.business_id,new.vehicle_id,'job_failure','Fleet job failed','An assigned Fleet route/job reported a failure.','critical','operational_event',new.id);
 elsif new.event_type='route_stop_skipped' then
  perform public.materialize_fleet_exception_alert(new.business_id,new.vehicle_id,'stop_skipped','Fleet stop skipped','A route stop was skipped and needs review.','warning','operational_event',new.id);
 elsif new.event_type in ('route_stop_arrived','route_stop_service_started','route_stop_completed','route_stop_departed') and new.metadata ? 'route_stop_id' then
  select * into s from public.fleet_route_stops where id=(new.metadata->>'route_stop_id')::uuid;
  if found and s.actual_arrived_at is not null and s.planned_arrival_at is not null then
   late_minutes:=extract(epoch from(s.actual_arrived_at-s.planned_arrival_at))/60.0;
   if late_minutes>=coalesce(p.late_stop_minutes,10) then perform public.materialize_fleet_exception_alert(new.business_id,new.vehicle_id,'late_stop','Fleet stop running late',concat('Stop ',s.stop_order,' arrived ',round(late_minutes),' minutes after plan.'),'warning','operational_event',new.id); end if;
  end if;
  if found and s.actual_service_started_at is not null and coalesce(s.actual_departed_at,s.actual_completed_at) is not null and s.planned_dwell_minutes is not null then
   dwell_minutes:=extract(epoch from(coalesce(s.actual_departed_at,s.actual_completed_at)-s.actual_service_started_at))/60.0-s.planned_dwell_minutes;
   if dwell_minutes>=coalesce(p.dwell_overrun_minutes,10) then perform public.materialize_fleet_exception_alert(new.business_id,new.vehicle_id,'dwell_overrun','Fleet stop dwell overrun',concat('Stop ',s.stop_order,' exceeded planned dwell by ',round(dwell_minutes),' minutes.'),'warning','operational_event',new.id); end if;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_fleet_operational_exception on public.fleet_operational_events;
create trigger trg_fleet_operational_exception after insert on public.fleet_operational_events for each row execute function public.evaluate_fleet_operational_exception();

create or replace function public.evaluate_fleet_geofence_exception()
returns trigger language plpgsql security definer set search_path='public','auth','extensions','pg_temp' as $$
declare p public.fleet_exception_policies; mins numeric;
begin
 if new.business_id is null or new.dwell_seconds is null then return new; end if;
 select * into p from public.fleet_exception_policies where business_id=new.business_id;
 mins:=new.dwell_seconds/60.0;
 if mins>=coalesce(p.geofence_dwell_minutes,30) then perform public.materialize_fleet_exception_alert(new.business_id,null,'geofence_long_dwell','Fleet geofence dwell anomaly',concat('Tracked Fleet activity remained inside a geofence for ',round(mins),' minutes.'),'warning','geofence_event',new.id); end if;
 return new;
end $$;
drop trigger if exists trg_fleet_geofence_exception on public.geofence_events;
create trigger trg_fleet_geofence_exception after insert on public.geofence_events for each row execute function public.evaluate_fleet_geofence_exception();

create or replace function public.evaluate_fleet_push_delivery_exception()
returns trigger language plpgsql security definer set search_path='public','auth','extensions','pg_temp' as $$
declare n public.notifications; b uuid;
begin
 if new.channel<>'push' or new.status<>'failed' or (tg_op='UPDATE' and old.status='failed') then return new; end if;
 select * into n from public.notifications where id=new.notification_id;
 if not found or coalesce(n.data->>'surface','')<>'fleet' or coalesce((n.data->>'exception_alert')::boolean,false) then return new; end if;
 begin b:=(n.data->>'business_id')::uuid; exception when others then return new; end;
 if b is not null then perform public.materialize_fleet_exception_alert(b,null,'push_delivery_failure','Fleet push delivery failed',coalesce(new.error,'A Fleet push notification failed to deliver.'),'warning','notification_delivery',new.id); end if;
 return new;
end $$;
drop trigger if exists trg_fleet_push_delivery_exception on public.notification_deliveries;
create trigger trg_fleet_push_delivery_exception after insert or update of status on public.notification_deliveries for each row execute function public.evaluate_fleet_push_delivery_exception();
