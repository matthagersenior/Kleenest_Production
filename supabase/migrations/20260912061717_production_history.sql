-- Make existing implicit RLS deny-all behavior explicit for internal-only tables.
-- These tables are granted only to postgres/service_role; direct anon/authenticated access is not part of the app contract.

drop policy if exists business_restroom_preventive_work_orders_client_deny on public.business_restroom_preventive_work_orders;
create policy business_restroom_preventive_work_orders_client_deny on public.business_restroom_preventive_work_orders
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists business_restroom_remediation_cases_client_deny on public.business_restroom_remediation_cases;
create policy business_restroom_remediation_cases_client_deny on public.business_restroom_remediation_cases
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists business_reverification_cases_client_deny on public.business_reverification_cases;
create policy business_reverification_cases_client_deny on public.business_reverification_cases
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists corridor_open_data_runtime_client_deny on public.corridor_open_data_runtime;
create policy corridor_open_data_runtime_client_deny on public.corridor_open_data_runtime
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists enterprise_location_feature_configs_client_deny on public.enterprise_location_feature_configs;
create policy enterprise_location_feature_configs_client_deny on public.enterprise_location_feature_configs
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists enterprise_location_staff_assignments_client_deny on public.enterprise_location_staff_assignments;
create policy enterprise_location_staff_assignments_client_deny on public.enterprise_location_staff_assignments
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists external_ingestion_adapters_client_deny on public.external_ingestion_adapters;
create policy external_ingestion_adapters_client_deny on public.external_ingestion_adapters
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists external_ingestion_runtime_client_deny on public.external_ingestion_runtime;
create policy external_ingestion_runtime_client_deny on public.external_ingestion_runtime
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists external_source_place_type_map_client_deny on public.external_source_place_type_map;
create policy external_source_place_type_map_client_deny on public.external_source_place_type_map
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists focus_ingestion_runtime_client_deny on public.focus_ingestion_runtime;
create policy focus_ingestion_runtime_client_deny on public.focus_ingestion_runtime
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists geo_catalog_export_state_client_deny on public.geo_catalog_export_state;
create policy geo_catalog_export_state_client_deny on public.geo_catalog_export_state
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists kleenest_storage_pressure_events_client_deny on public.kleenest_storage_pressure_events;
create policy kleenest_storage_pressure_events_client_deny on public.kleenest_storage_pressure_events
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists national_ingestion_markets_client_deny on public.national_ingestion_markets;
create policy national_ingestion_markets_client_deny on public.national_ingestion_markets
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists national_ingestion_runs_client_deny on public.national_ingestion_runs;
create policy national_ingestion_runs_client_deny on public.national_ingestion_runs
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists national_ingestion_source_policies_client_deny on public.national_ingestion_source_policies;
create policy national_ingestion_source_policies_client_deny on public.national_ingestion_source_policies
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists national_ingestion_storage_guard_client_deny on public.national_ingestion_storage_guard;
create policy national_ingestion_storage_guard_client_deny on public.national_ingestion_storage_guard
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists platform_notification_attribution_client_deny on public.platform_notification_attribution;
create policy platform_notification_attribution_client_deny on public.platform_notification_attribution
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists platform_notification_rule_runs_client_deny on public.platform_notification_rule_runs;
create policy platform_notification_rule_runs_client_deny on public.platform_notification_rule_runs
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists platform_notification_rules_client_deny on public.platform_notification_rules;
create policy platform_notification_rules_client_deny on public.platform_notification_rules
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists platform_owner_control_audit_client_deny on public.platform_owner_control_audit;
create policy platform_owner_control_audit_client_deny on public.platform_owner_control_audit
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists progression_supply_runs_client_deny on public.progression_supply_runs;
create policy progression_supply_runs_client_deny on public.progression_supply_runs
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists progression_supply_templates_client_deny on public.progression_supply_templates;
create policy progression_supply_templates_client_deny on public.progression_supply_templates
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists real_world_demo_loop_events_client_deny on public.real_world_demo_loop_events;
create policy real_world_demo_loop_events_client_deny on public.real_world_demo_loop_events
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists real_world_demo_loop_sessions_client_deny on public.real_world_demo_loop_sessions;
create policy real_world_demo_loop_sessions_client_deny on public.real_world_demo_loop_sessions
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists stripe_webhook_events_client_deny on public.stripe_webhook_events;
create policy stripe_webhook_events_client_deny on public.stripe_webhook_events
  for all to anon, authenticated
  using (false)
  with check (false);

