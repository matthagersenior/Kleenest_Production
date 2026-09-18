alter function public.fleet_assign_driver_user(uuid,uuid,uuid) set search_path = '';
alter function public.fleet_record_route_stop_timing(uuid,uuid,uuid,text,timestamptz) set search_path = '';
alter function public.fleet_route_performance(uuid,uuid) set search_path = '';
alter function public.fleet_set_route_stops(uuid,uuid,jsonb) set search_path = '';

revoke all on function public.fleet_assign_driver_user(uuid,uuid,uuid) from public, anon;
revoke all on function public.fleet_record_route_stop_timing(uuid,uuid,uuid,text,timestamptz) from public, anon;
revoke all on function public.fleet_route_performance(uuid,uuid) from public, anon;
revoke all on function public.fleet_set_route_stops(uuid,uuid,jsonb) from public, anon;

grant execute on function public.fleet_assign_driver_user(uuid,uuid,uuid) to authenticated;
grant execute on function public.fleet_record_route_stop_timing(uuid,uuid,uuid,text,timestamptz) to authenticated;
grant execute on function public.fleet_route_performance(uuid,uuid) to authenticated;
grant execute on function public.fleet_set_route_stops(uuid,uuid,jsonb) to authenticated;
