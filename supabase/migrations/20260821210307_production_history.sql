create or replace function public.create_gps_geofence_notification(p_location_id uuid,p_distance_m integer,p_category text default null)
returns public.notifications
language plpgsql
security definer
set search_path to ''
as $$
declare v_user uuid := auth.uid(); v_notification public.notifications;
 v_name text; v_existing boolean;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_location_id is null then raise exception 'Location required'; end if;
 select l.name into v_name from public.locations l where l.id=p_location_id and l.is_active=true;
 if v_name is null then return null; end if;
 select exists(select 1 from public.notifications n where n.user_id=v_user and n.type='geofence_nearby' and n.data->>'location_id'=p_location_id::text and n.created_at>now()-interval '24 hours') into v_existing;
 if v_existing then return null; end if;
 if exists(select 1 from public.notification_preferences np where np.user_id=v_user and coalesce(np.push,true)=false) then return null; end if;
 insert into public.notifications(user_id,type,title,body,data)
 values(v_user,'geofence_nearby',case when p_category='restroom' then 'Bathroom nearby' else 'Kleenest place nearby' end,
   format('%s is about %s away. Check in, verify what you find, or leave a review.',v_name,case when p_distance_m<1000 then p_distance_m||' m' else round(p_distance_m/1609.344,1)||' mi' end),
   jsonb_build_object('location_id',p_location_id,'distance_m',p_distance_m,'category',p_category,'source','gps_geofence','url','/place/'||p_location_id::text,'actions',jsonb_build_array(jsonb_build_object('label','Open place','url','/place/'||p_location_id::text),jsonb_build_object('label','Check in','url','/place/'||p_location_id::text)))
 ) returning * into v_notification;
 return v_notification;
end;
$$;
revoke all on function public.create_gps_geofence_notification(uuid,integer,text) from public;
grant execute on function public.create_gps_geofence_notification(uuid,integer,text) to authenticated;
