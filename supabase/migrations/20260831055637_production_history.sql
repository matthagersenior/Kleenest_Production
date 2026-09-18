alter function public.compute_bathroom_intelligence(uuid) set search_path = '';
revoke all on function public.compute_bathroom_intelligence(uuid) from public, anon, authenticated;
grant execute on function public.compute_bathroom_intelligence(uuid) to service_role;

alter function public.reconcile_external_location_evidence(uuid) set search_path = '';
revoke all on function public.reconcile_external_location_evidence(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_external_location_evidence(uuid) to service_role;

alter function public.refresh_location_trust_state(uuid) set search_path = '';
revoke all on function public.refresh_location_trust_state(uuid) from public, anon, authenticated;
grant execute on function public.refresh_location_trust_state(uuid) to service_role;

alter function public.national_ingestion_storage_status() set search_path = '';
revoke all on function public.national_ingestion_storage_status() from public, anon, authenticated;
grant execute on function public.national_ingestion_storage_status() to service_role;

alter function public.ingest_external_locations(text, jsonb) set search_path = '';
revoke all on function public.ingest_external_locations(text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_external_locations(text, jsonb) to service_role;
