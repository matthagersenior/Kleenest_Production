create or replace function public.publish_intelligence_location_event(p_location_id uuid,p_event_type text,p_title text,p_body text,p_payload jsonb default '{}'::jsonb,p_radius_m integer default 10000,p_dedupe_key text default null)
returns uuid language plpgsql security definer set search_path=public,auth,extensions,pg_temp
as $$
declare v_notification_id uuid; v_dedupe text; v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_location_id is null or not exists(select 1 from public.locations where id=p_location_id) then raise exception 'Location not found'; end if;
 if nullif(trim(p_event_type),'') is null then raise exception 'event_type is required'; end if;
 if p_radius_m is null or p_radius_m<1 or p_radius_m>50000 then raise exception 'Invalid notification radius'; end if;
 v_dedupe:=coalesce(p_dedupe_key,p_event_type||':'||p_location_id::text||':'||date_trunc('hour',now())::text);
 insert into public.notification_events(event_type,actor_user_id,location_id,audience_scope,payload,dedupe_key,expires_at)
 values(p_event_type,v_user,p_location_id,'nearby',jsonb_build_object('title',p_title,'body',p_body)||coalesce(p_payload,'{}'::jsonb),v_dedupe,now()+interval '1 hour')
 on conflict(dedupe_key) where dedupe_key is not null do update set payload=excluded.payload,created_at=now(),expires_at=excluded.expires_at
 returning id into v_notification_id;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
 select v_notification_id,r.user_id,'in_app' from public.resolve_nearby_notification_recipients(p_location_id,p_radius_m) r
 on conflict(notification_id,recipient_user_id,channel) do nothing;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
 select v_notification_id,r.user_id,'push' from public.resolve_nearby_notification_recipients(p_location_id,p_radius_m) r
 on conflict(notification_id,recipient_user_id,channel) do nothing;
 perform public.materialize_notification_event(v_notification_id);
 perform public.queue_push_deliveries_for_notification(v_notification_id);
 return v_notification_id;
end; $$;

create or replace function public.resolve_nearby_notification_recipients(p_location_id uuid,p_radius_m integer default 10000)
returns table(user_id uuid) language sql security definer set search_path=public,auth,extensions,pg_temp
as $$ with target as (select latitude,longitude from public.locations where id=p_location_id), latest as (select distinct on (ls.user_id) ls.user_id,ls.latitude,ls.longitude from public.location_discovery_sessions ls order by ls.user_id,ls.created_at desc), obs as (select distinct on (lo.observer_user_id) lo.observer_user_id as user_id,lo.latitude,lo.longitude from public.location_observations lo where lo.latitude is not null and lo.longitude is not null order by lo.observer_user_id,lo.observed_at desc), pos as (select coalesce(o.user_id,l.user_id) user_id,coalesce(o.latitude,l.latitude) latitude,coalesce(o.longitude,l.longitude) longitude from latest l full join obs o on o.user_id=l.user_id) select distinct pos.user_id from pos join public.notification_preferences np on np.user_id=pos.user_id cross join target t where coalesce(np.push,true)=true and 111320*sqrt(power((pos.latitude-t.latitude),2)+power((pos.longitude-t.longitude)*cos(radians(t.latitude)),2)) <= least(greatest(p_radius_m,1),50000); $$;
