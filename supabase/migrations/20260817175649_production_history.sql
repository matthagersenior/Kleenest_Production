create or replace function public.fleet_actor_is_manager(p_business_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and lower(bm.role::text) in ('owner','admin','manager'));
$$;
revoke all on function public.fleet_actor_is_manager(uuid) from public;

create or replace function public.fleet_set_vehicle_status(p_business_id uuid,p_vehicle_id uuid,p_status text)
returns public.fleet_vehicles language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.fleet_vehicles; begin
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager permission required'; end if;
 if p_status not in ('active','inactive','maintenance','out_of_service') then raise exception 'Invalid vehicle status'; end if;
 update public.fleet_vehicles set status=p_status,updated_at=now() where id=p_vehicle_id and business_id=p_business_id returning * into r;
 if not found then raise exception 'Vehicle not found'; end if; return r;
end $$;
revoke all on function public.fleet_set_vehicle_status(uuid,uuid,text) from public;
grant execute on function public.fleet_set_vehicle_status(uuid,uuid,text) to authenticated;

create or replace function public.fleet_set_driver_status(p_business_id uuid,p_driver_id uuid,p_status text)
returns public.fleet_drivers language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.fleet_drivers; begin
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager permission required'; end if;
 if p_status not in ('active','inactive','on_leave','suspended') then raise exception 'Invalid driver status'; end if;
 update public.fleet_drivers set status=p_status,updated_at=now() where id=p_driver_id and business_id=p_business_id returning * into r;
 if not found then raise exception 'Driver not found'; end if; return r;
end $$;
revoke all on function public.fleet_set_driver_status(uuid,uuid,text) from public;
grant execute on function public.fleet_set_driver_status(uuid,uuid,text) to authenticated;

create or replace function public.fleet_complete_maintenance(p_business_id uuid,p_maintenance_id uuid,p_notes text default null)
returns public.fleet_maintenance_records language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.fleet_maintenance_records; begin
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager permission required'; end if;
 update public.fleet_maintenance_records set status='completed',completed_at=coalesce(completed_at,now()),notes=coalesce(p_notes,notes),updated_at=now() where id=p_maintenance_id and business_id=p_business_id returning * into r;
 if not found then raise exception 'Maintenance record not found'; end if; return r;
end $$;
revoke all on function public.fleet_complete_maintenance(uuid,uuid,text) from public;
grant execute on function public.fleet_complete_maintenance(uuid,uuid,text) to authenticated;

create or replace function public.fleet_resolve_alert(p_business_id uuid,p_alert_id uuid,p_resolution text default null)
returns public.fleet_alerts language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.fleet_alerts; begin
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager permission required'; end if;
 update public.fleet_alerts set status='resolved',resolved_at=coalesce(resolved_at,now()),details=case when nullif(trim(coalesce(p_resolution,'')),'') is null then details else coalesce(details,'')||E'\nResolution: '||trim(p_resolution) end where id=p_alert_id and business_id=p_business_id returning * into r;
 if not found then raise exception 'Alert not found'; end if; return r;
end $$;
revoke all on function public.fleet_resolve_alert(uuid,uuid,text) from public;
grant execute on function public.fleet_resolve_alert(uuid,uuid,text) to authenticated;

create or replace function public.fleet_set_route_status(p_business_id uuid,p_route_id uuid,p_status text)
returns public.fleet_routes language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.fleet_routes; begin
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager permission required'; end if;
 if p_status not in ('planned','active','completed','cancelled','paused') then raise exception 'Invalid route status'; end if;
 update public.fleet_routes set status=p_status,updated_at=now() where id=p_route_id and business_id=p_business_id returning * into r;
 if not found then raise exception 'Route not found'; end if; return r;
end $$;
revoke all on function public.fleet_set_route_status(uuid,uuid,text) from public;
grant execute on function public.fleet_set_route_status(uuid,uuid,text) to authenticated;
