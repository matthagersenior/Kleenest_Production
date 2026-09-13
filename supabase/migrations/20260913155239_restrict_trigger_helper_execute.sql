
revoke all on function public.strip_cold_location_metadata() from public, anon, authenticated;
grant execute on function public.strip_cold_location_metadata() to service_role;

revoke all on function public.strip_external_location_raw_payload() from public, anon, authenticated;
grant execute on function public.strip_external_location_raw_payload() to service_role;
