begin;
create or replace function public.publish_fleet_route_notification(p_route_id uuid,p_event_type text,p_title text,p_body text,p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare v_route public.fleet_routes%rowtype; v_event uuid; v_allowed boolean;
begin
 select * into v_route from public.fleet_routes where id=p_route_id;
 if not found then raise exception 'fleet route not found'; end if;
 v_allowed:=public.fleet_actor_is_manager(v_route.business_id);
 if not v_allowed then raise exception 'Fleet manager authorization required'; end if;
 insert into public.fleet_route_updates(route_id,update_type,actor_user_id,payload) values(p_route_id,p_event_type,auth.uid(),coalesce(p_payload,'{}'::jsonb));
 insert into public.notification_events(event_type,actor_user_id,location_id,audience_scope,payload,dedupe_key,expires_at) values(p_event_type,auth.uid(),null,'fleet',jsonb_build_object('title',p_title,'body',p_body,'fleet_route_id',p_route_id,'business_id',v_route.business_id)||coalesce(p_payload,'{}'::jsonb),'fleet:'||p_route_id::text||':'||p_event_type||':'||date_trunc('minute',now())::text,now()+interval '24 hours') on conflict(dedupe_key) where dedupe_key is not null do update set payload=excluded.payload,created_at=now(),expires_at=excluded.expires_at returning id into v_event;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel) select v_event,m.user_id,'in_app' from public.app_business_memberships m where m.business_id=v_route.business_id on conflict(notification_id,recipient_user_id,channel) do nothing;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel) select v_event,u.id,'in_app' from public.fleet_drivers d join auth.users u on lower(u.email)=lower(d.email) where d.id=v_route.driver_id on conflict(notification_id,recipient_user_id,channel) do nothing;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel) select v_event,m.user_id,'push' from public.app_business_memberships m where m.business_id=v_route.business_id on conflict(notification_id,recipient_user_id,channel) do nothing;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel) select v_event,u.id,'push' from public.fleet_drivers d join auth.users u on lower(u.email)=lower(d.email) where d.id=v_route.driver_id on conflict(notification_id,recipient_user_id,channel) do nothing;
 return v_event;
end; $$;
commit;
