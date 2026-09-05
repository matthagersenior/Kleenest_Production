-- Active Business, Fleet, Enterprise and Owner RPCs are authenticated/role-gated.
-- Remove inherited anonymous EXECUTE grants and pin privileged SECURITY DEFINER search paths.

alter function public.admin_list_ai_response_reports(text) set search_path = '';
revoke all on function public.admin_list_ai_response_reports(text) from public, anon;
grant execute on function public.admin_list_ai_response_reports(text) to authenticated, service_role;

alter function public.admin_list_user_safety_reports(text) set search_path = '';
revoke all on function public.admin_list_user_safety_reports(text) from public, anon;
grant execute on function public.admin_list_user_safety_reports(text) to authenticated, service_role;

alter function public.admin_resolve_ai_response_report(uuid, text, text) set search_path = '';
revoke all on function public.admin_resolve_ai_response_report(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_ai_response_report(uuid, text, text) to authenticated, service_role;

alter function public.admin_resolve_user_safety_report(uuid, text) set search_path = '';
revoke all on function public.admin_resolve_user_safety_report(uuid, text) from public, anon;
grant execute on function public.admin_resolve_user_safety_report(uuid, text) to authenticated, service_role;

alter function public.admin_resolve_location_claim(uuid, text) set search_path = '';
revoke all on function public.admin_resolve_location_claim(uuid, text) from public, anon;
grant execute on function public.admin_resolve_location_claim(uuid, text) to authenticated, service_role;

alter function public.business_list_location_claims(uuid) set search_path = '';
revoke all on function public.business_list_location_claims(uuid) from public, anon;
grant execute on function public.business_list_location_claims(uuid) to authenticated, service_role;

alter function public.business_progression_engagement_snapshot(uuid) set search_path = '';
revoke all on function public.business_progression_engagement_snapshot(uuid) from public, anon;
grant execute on function public.business_progression_engagement_snapshot(uuid) to authenticated, service_role;

alter function public.fleet_progression_snapshot(uuid) set search_path = '';
revoke all on function public.fleet_progression_snapshot(uuid) from public, anon;
grant execute on function public.fleet_progression_snapshot(uuid) to authenticated, service_role;

alter function public.fleet_route_geofence_manifest(uuid, uuid) set search_path = '';
revoke all on function public.fleet_route_geofence_manifest(uuid, uuid) from public, anon;
grant execute on function public.fleet_route_geofence_manifest(uuid, uuid) to authenticated, service_role;

alter function public.enterprise_operational_portfolio_snapshot(uuid) set search_path = '';
revoke all on function public.enterprise_operational_portfolio_snapshot(uuid) from public, anon;
grant execute on function public.enterprise_operational_portfolio_snapshot(uuid) to authenticated, service_role;
