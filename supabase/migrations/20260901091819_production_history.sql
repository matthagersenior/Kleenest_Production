create or replace function public.set_route_plan_geometry(p_route_id uuid,p_route_geometry jsonb)
returns public.route_plans
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare v_user uuid:=auth.uid(); v_route public.route_plans;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if p_route_geometry is null or jsonb_typeof(p_route_geometry)<>'object' then raise exception 'route geometry is required'; end if;
 if coalesce(p_route_geometry->>'type','') not in ('LineString','MultiLineString') then raise exception 'route geometry must be a LineString or MultiLineString'; end if;
 update public.route_plans
 set route_geometry=p_route_geometry,updated_at=now()
 where id=p_route_id and user_id=v_user
 returning * into v_route;
 if not found then raise exception 'route not found'; end if;
 return v_route;
end;$function$;
revoke all on function public.set_route_plan_geometry(uuid,jsonb) from public,anon;
grant execute on function public.set_route_plan_geometry(uuid,jsonb) to authenticated,service_role;
