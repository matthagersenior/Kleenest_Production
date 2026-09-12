-- Reduce anonymous SECURITY DEFINER RPC exposure without changing public consumer surfaces.
-- Internal helpers/schedulers become service-role only.
-- User-scoped RPCs that already require auth.uid() become authenticated-only.

-- Service-role-only internal helpers.
revoke all on function public._progression_level_for_xp(bigint)
  from public, anon, authenticated;
grant execute on function public._progression_level_for_xp(bigint)
  to service_role;

revoke all on function public.cold_ingestion_run_archive_ack(uuid[])
  from public, anon, authenticated;
grant execute on function public.cold_ingestion_run_archive_ack(uuid[])
  to service_role;

revoke all on function public.cold_ingestion_run_archive_batch(integer)
  from public, anon, authenticated;
grant execute on function public.cold_ingestion_run_archive_batch(integer)
  to service_role;

revoke all on function public.run_corridor_ingestion_scheduler()
  from public, anon, authenticated;
grant execute on function public.run_corridor_ingestion_scheduler()
  to service_role;

revoke all on function public.run_corridor_open_data_scheduler()
  from public, anon, authenticated;
grant execute on function public.run_corridor_open_data_scheduler()
  to service_role;

-- Authenticated-only user-scoped RPCs.
revoke all on function public.attach_discovery_photo(uuid,text,text,bigint,integer,integer)
  from public, anon;
grant execute on function public.attach_discovery_photo(uuid,text,text,bigint,integer,integer)
  to authenticated, service_role;

revoke all on function public.consumer_active_objectives()
  from public, anon;
grant execute on function public.consumer_active_objectives()
  to authenticated, service_role;

revoke all on function public.consumer_match_or_create_discovery(jsonb)
  from public, anon;
grant execute on function public.consumer_match_or_create_discovery(jsonb)
  to authenticated, service_role;

revoke all on function public.consumer_progression_overview()
  from public, anon;
grant execute on function public.consumer_progression_overview()
  to authenticated, service_role;

revoke all on function public.consumer_progression_rankings(text,text,jsonb)
  from public, anon;
grant execute on function public.consumer_progression_rankings(text,text,jsonb)
  to authenticated, service_role;

revoke all on function public.consumer_record_discovery_evidence(uuid,jsonb)
  from public, anon;
grant execute on function public.consumer_record_discovery_evidence(uuid,jsonb)
  to authenticated, service_role;

revoke all on function public.list_my_blocked_users()
  from public, anon;
grant execute on function public.list_my_blocked_users()
  to authenticated, service_role;

revoke all on function public.live_network_motif_snapshot(uuid,integer)
  from public, anon;
grant execute on function public.live_network_motif_snapshot(uuid,integer)
  to authenticated, service_role;

revoke all on function public.record_progression_event_v2(text,jsonb,text)
  from public, anon;
grant execute on function public.record_progression_event_v2(text,jsonb,text)
  to authenticated, service_role;

revoke all on function public.report_ai_response(text,text,text,text,text,text,text)
  from public, anon;
grant execute on function public.report_ai_response(text,text,text,text,text,text,text)
  to authenticated, service_role;

revoke all on function public.require_current_policy_acceptance()
  from public, anon;
grant execute on function public.require_current_policy_acceptance()
  to authenticated, service_role;
