revoke execute on function public.record_favorite_route_event(uuid,uuid,numeric,numeric) from public;
revoke execute on function public.record_location_route_event(uuid,boolean) from public;
grant execute on function public.record_favorite_route_event(uuid,uuid,numeric,numeric) to authenticated;
grant execute on function public.record_location_route_event(uuid,boolean) to authenticated;
