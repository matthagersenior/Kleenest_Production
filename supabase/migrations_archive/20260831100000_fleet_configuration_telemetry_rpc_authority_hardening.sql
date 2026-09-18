alter function public.assign_fleet_metric(uuid,text,uuid) set search_path = '';
alter function public.create_fleet_metric_definition(uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,jsonb,text) set search_path = '';
alter function public.fleet_assign_driver_user(uuid,uuid,uuid) set search_path = '';
alter function public.fleet_record_route_stop_timing(uuid,uuid,uuid,text,timestamp with time zone) set search_path = '';
alter function public.fleet_route_performance(uuid,uuid) set search_path = '';
alter function public.fleet_set_route_stops(uuid,uuid,jsonb) set search_path = '';
alter function public.fleet_update_dispatch_signal_policy(uuid,boolean,integer,numeric,integer,integer,integer) set search_path = '';
alter function public.fleet_update_exception_policy(uuid,integer,integer,integer,boolean,boolean) set search_path = '';
alter function public.update_fleet_metric_definition(uuid,text,text,numeric,numeric,numeric,text,jsonb,text,boolean) set search_path = '';

revoke execute on function public.assign_fleet_metric(uuid,text,uuid) from public, anon;
revoke execute on function public.create_fleet_metric_definition(uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,jsonb,text) from public, anon;
revoke execute on function public.fleet_assign_driver_user(uuid,uuid,uuid) from public, anon;
revoke execute on function public.fleet_record_route_stop_timing(uuid,uuid,uuid,text,timestamp with time zone) from public, anon;
revoke execute on function public.fleet_route_performance(uuid,uuid) from public, anon;
revoke execute on function public.fleet_set_route_stops(uuid,uuid,jsonb) from public, anon;
revoke execute on function public.fleet_update_dispatch_signal_policy(uuid,boolean,integer,numeric,integer,integer,integer) from public, anon;
revoke execute on function public.fleet_update_exception_policy(uuid,integer,integer,integer,boolean,boolean) from public, anon;
revoke execute on function public.update_fleet_metric_definition(uuid,text,text,numeric,numeric,numeric,text,jsonb,text,boolean) from public, anon;

grant execute on function public.assign_fleet_metric(uuid,text,uuid) to authenticated, service_role;
grant execute on function public.create_fleet_metric_definition(uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,jsonb,text) to authenticated, service_role;
grant execute on function public.fleet_assign_driver_user(uuid,uuid,uuid) to authenticated, service_role;
grant execute on function public.fleet_record_route_stop_timing(uuid,uuid,uuid,text,timestamp with time zone) to authenticated, service_role;
grant execute on function public.fleet_route_performance(uuid,uuid) to authenticated, service_role;
grant execute on function public.fleet_set_route_stops(uuid,uuid,jsonb) to authenticated, service_role;
grant execute on function public.fleet_update_dispatch_signal_policy(uuid,boolean,integer,numeric,integer,integer,integer) to authenticated, service_role;
grant execute on function public.fleet_update_exception_policy(uuid,integer,integer,integer,boolean,boolean) to authenticated, service_role;
grant execute on function public.update_fleet_metric_definition(uuid,text,text,numeric,numeric,numeric,text,jsonb,text,boolean) to authenticated, service_role;
