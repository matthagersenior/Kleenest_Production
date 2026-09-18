create or replace function public.fleet_driver_assignment_candidates(p_business_id uuid)
returns table(user_id uuid, display_name text, username text, member_role text, assigned_driver_id uuid, assigned_driver_name text)
language plpgsql stable security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager access required'; end if;
  return query
  select bm.user_id,
         coalesce(nullif(p.display_name,''),nullif(p.username,''),'Business member') as display_name,
         p.username,
         bm.role::text as member_role,
         d.id as assigned_driver_id,
         d.name as assigned_driver_name
  from public.business_members bm
  left join public.profiles p on p.id=bm.user_id
  left join public.fleet_drivers d on d.business_id=bm.business_id and d.user_id=bm.user_id
  where bm.business_id=p_business_id
  order by coalesce(nullif(p.display_name,''),nullif(p.username,''),'Business member'), bm.user_id;
end $$;
revoke execute on function public.fleet_driver_assignment_candidates(uuid) from public,anon;
grant execute on function public.fleet_driver_assignment_candidates(uuid) to authenticated;

create or replace function public.publish_fleet_route_notification(p_route_id uuid, p_event_type text, p_title text, p_body text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare v_route public.fleet_routes%rowtype; v_event uuid; v_allowed boolean;
begin
 select * into v_route from public.fleet_routes where id=p_route_id;
 if not found then raise exception 'fleet route not found'; end if;
 v_allowed:=public.fleet_actor_is_manager(v_route.business_id);
 if not v_allowed then raise exception 'Fleet manager authorization required'; end if;
 insert into public.fleet_route_updates(route_id,update_type,actor_user_id,payload)
 values(p_route_id,p_event_type,auth.uid(),coalesce(p_payload,'{}'::jsonb));
 insert into public.notification_events(event_type,actor_user_id,location_id,audience_scope,payload,dedupe_key,expires_at)
 values(p_event_type,auth.uid(),null,'fleet',jsonb_build_object('title',p_title,'body',p_body,'fleet_route_id',p_route_id,'business_id',v_route.business_id)||coalesce(p_payload,'{}'::jsonb),'fleet:'||p_route_id::text||':'||p_event_type||':'||date_trunc('minute',now())::text,now()+interval '24 hours')
 on conflict(dedupe_key) where dedupe_key is not null do update set payload=excluded.payload,created_at=now(),expires_at=excluded.expires_at returning id into v_event;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
 select v_event, recipients.user_id, channels.channel
 from (
   select m.user_id from public.app_business_memberships m where m.business_id=v_route.business_id
   union
   select d.user_id from public.fleet_drivers d where d.id=v_route.driver_id and d.user_id is not null
 ) recipients
 cross join (values ('in_app'::text),('push'::text)) channels(channel)
 on conflict(notification_id,recipient_user_id,channel) do nothing;
 return v_event;
end $$;
revoke execute on function public.publish_fleet_route_notification(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.publish_fleet_route_notification(uuid,text,text,text,jsonb) to authenticated;

create or replace function public.fleet_dispatch_route(p_business_id uuid, p_route_id uuid)
returns public.fleet_routes
language plpgsql security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare r public.fleet_routes; v_stop_count integer; v_notification_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager access required'; end if;
 select * into r from public.fleet_routes where id=p_route_id and business_id=p_business_id for update;
 if not found then raise exception 'Route not found'; end if;
 if r.vehicle_id is null then raise exception 'Assign a vehicle before dispatch'; end if;
 if r.driver_id is null then raise exception 'Assign a driver before dispatch'; end if;
 select count(*) into v_stop_count from public.fleet_route_stops where route_id=r.id;
 if v_stop_count < 1 then raise exception 'Add at least one route stop before dispatch'; end if;
 if r.status not in ('planned','paused') then raise exception 'Only planned or paused routes can be dispatched'; end if;
 update public.fleet_routes set status='active',dispatched_at=coalesce(dispatched_at,now()),started_at=coalesce(started_at,now()),dispatch_locked=true,stops_count=v_stop_count,updated_at=now() where id=p_route_id returning * into r;
 insert into public.fleet_operational_events(business_id,vehicle_id,driver_id,route_id,event_type,occurred_at,metadata)
 values(p_business_id,r.vehicle_id,r.driver_id,r.id,'route_dispatched',now(),jsonb_build_object('scheduled_for',r.scheduled_for,'dispatched_at',r.dispatched_at,'stops_count',v_stop_count));
 select public.publish_fleet_route_notification(r.id,'route_dispatched','Route dispatched','Fleet route '||coalesce(r.name,'route')||' has been dispatched.',jsonb_build_object('business_id',p_business_id,'status','active','driver_id',r.driver_id,'vehicle_id',r.vehicle_id,'stops_count',v_stop_count)) into v_notification_id;
 return r;
end $$;
revoke execute on function public.fleet_dispatch_route(uuid,uuid) from public,anon;
grant execute on function public.fleet_dispatch_route(uuid,uuid) to authenticated;
