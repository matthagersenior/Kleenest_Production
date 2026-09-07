-- Internal maintenance and trigger helpers must not be reachable through the public API.
revoke execute on function public.bridge_fleet_stop_progression_v2() from public, anon, authenticated;
revoke execute on function public.compact_kleenest_storage() from public, anon, authenticated;
revoke execute on function public.enforce_canonical_domain_contract() from public, anon, authenticated;
revoke execute on function public.run_focus_ingestion_scheduler() from public, anon, authenticated;
revoke execute on function public.sync_fleet_route_stop_from_geofence() from public, anon, authenticated;

grant execute on function public.bridge_fleet_stop_progression_v2() to service_role;
grant execute on function public.compact_kleenest_storage() to service_role;
grant execute on function public.enforce_canonical_domain_contract() to service_role;
grant execute on function public.run_focus_ingestion_scheduler() to service_role;
grant execute on function public.sync_fleet_route_stop_from_geofence() to service_role;
