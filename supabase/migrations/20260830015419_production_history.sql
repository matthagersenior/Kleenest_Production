create or replace function public.materialize_fleet_operational_notification()
returns trigger language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare v_event uuid; v_title text; v_body text; v_type text;
begin
 if new.business_id is null or new.event_type not in ('route_completed','route_failed','route_cancelled','route_stop_completed','route_stop_skipped','job_completed','job_failed') then return new; end if;
 v_type:='fleet_'||new.event_type;
 v_title:=case when new.event_type in ('route_completed','job_completed','route_stop_completed') then 'Fleet job completed' when new.event_type in ('route_failed','job_failed') then 'Fleet job failed' when new.event_type='route_cancelled' then 'Fleet route cancelled' else 'Fleet stop needs attention' end;
 v_body:=case when new.event_type in ('route_completed','job_completed') then 'An assigned fleet job completed.' when new.event_type='route_stop_completed' then 'A route stop completed.' when new.event_type in ('route_failed','job_failed') then 'A fleet job reported a failure.' when new.event_type='route_cancelled' then 'A fleet route was cancelled.' else 'A route stop was skipped and may need follow-up.' end;
 insert into public.notification_events(event_type,actor_user_id,location_id,audience_scope,payload,dedupe_key,expires_at)
 values(v_type,null,(new.metadata->>'location_id')::uuid,'fleet',jsonb_build_object('title',v_title,'body',v_body,'business_id',new.business_id,'route_id',new.route_id,'vehicle_id',new.vehicle_id,'driver_id',new.driver_id,'source_event_id',new.id,'source_event_type',new.event_type,'occurred_at',new.occurred_at,'metadata',new.metadata),'fleet-operational:'||new.id::text,now()+interval '7 days')
 on conflict(dedupe_key) where dedupe_key is not null do update set payload=excluded.payload,expires_at=excluded.expires_at returning id into v_event;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
 select v_event,m.user_id,c.channel from public.app_business_memberships m cross join (values('in_app'::text),('push'::text)) c(channel)
 where m.business_id=new.business_id and m.role::text in ('owner','admin','manager','staff')
 on conflict(notification_id,recipient_user_id,channel) do nothing;
 perform public.materialize_notification_event(v_event);
 perform public.queue_push_deliveries_for_notification(v_event);
 return new;
end $$;

create or replace function public.materialize_fleet_geofence_notification()
returns trigger language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare v_event uuid; v_title text; v_body text;
begin
 if new.business_id is null or new.event_type not in ('enter','entry','exit','dwell') then return new; end if;
 v_title:=case when new.event_type in ('enter','entry') then 'Fleet geofence entered' when new.event_type='exit' then 'Fleet geofence exited' else 'Fleet geofence dwell detected' end;
 v_body:=case when new.event_type in ('enter','entry') then 'A tracked fleet activity entered a configured geofence.' when new.event_type='exit' then 'A tracked fleet activity exited a configured geofence.' else 'A tracked fleet activity remained inside a geofence long enough to record dwell.' end;
 insert into public.notification_events(event_type,actor_user_id,location_id,audience_scope,payload,dedupe_key,expires_at)
 values('fleet_geofence_'||new.event_type,new.user_id,new.location_id,'fleet',jsonb_build_object('title',v_title,'body',v_body,'business_id',new.business_id,'geofence_id',new.geofence_id,'source_event_id',new.id,'source_event_type',new.event_type,'dwell_seconds',new.dwell_seconds,'occurred_at',new.occurred_at,'metadata',new.metadata),'fleet-geofence:'||new.id::text,now()+interval '7 days')
 on conflict(dedupe_key) where dedupe_key is not null do update set payload=excluded.payload,expires_at=excluded.expires_at returning id into v_event;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
 select v_event,m.user_id,c.channel from public.app_business_memberships m cross join (values('in_app'::text),('push'::text)) c(channel)
 where m.business_id=new.business_id and m.role::text in ('owner','admin','manager','staff')
 on conflict(notification_id,recipient_user_id,channel) do nothing;
 perform public.materialize_notification_event(v_event);
 perform public.queue_push_deliveries_for_notification(v_event);
 return new;
end $$;

create or replace function public.fleet_set_route_status(p_business_id uuid,p_route_id uuid,p_status text)
returns public.fleet_routes language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare r public.fleet_routes; v_previous text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager permission required'; end if;
 if p_status not in ('planned','active','completed','cancelled','paused','failed') then raise exception 'Invalid route status'; end if;
 select status into v_previous from public.fleet_routes where id=p_route_id and business_id=p_business_id for update;
 if not found then raise exception 'Route not found'; end if;
 update public.fleet_routes set status=p_status,
   dispatched_at=case when p_status='active' then coalesce(dispatched_at,now()) else dispatched_at end,
   started_at=case when p_status='active' then coalesce(started_at,now()) else started_at end,
   actual_completed_at=case when p_status='completed' then coalesce(actual_completed_at,now()) when p_status in ('planned','active','paused') then null else actual_completed_at end,
   dispatch_locked=case when p_status in ('active','completed','failed') then true when p_status='planned' then false else dispatch_locked end,
   updated_at=now()
 where id=p_route_id and business_id=p_business_id returning * into r;
 if p_status is distinct from v_previous and p_status in ('completed','cancelled','failed') then
   insert into public.fleet_operational_events(business_id,vehicle_id,driver_id,route_id,event_type,occurred_at,metadata)
   values(p_business_id,r.vehicle_id,r.driver_id,p_route_id,case p_status when 'completed' then 'route_completed' when 'failed' then 'route_failed' else 'route_cancelled' end,now(),jsonb_build_object('previous_status',v_previous,'new_status',p_status,'actor_user_id',auth.uid(),'completion_source','route_status_transition'));
 end if;
 return r;
end $$;
