alter function public.converge_fleet_operational_event_to_intelligence() set search_path = '';
alter function public.materialize_fleet_geofence_notification() set search_path = '';
alter function public.materialize_fleet_operational_notification() set search_path = '';
alter function public.sync_external_location_address() set search_path = '';

revoke all on function public.converge_fleet_operational_event_to_intelligence() from public, anon, authenticated;
revoke all on function public.materialize_fleet_geofence_notification() from public, anon, authenticated;
revoke all on function public.materialize_fleet_operational_notification() from public, anon, authenticated;
revoke all on function public.sync_external_location_address() from public, anon, authenticated;

alter view public.place_experience_projection set (security_invoker = true);
