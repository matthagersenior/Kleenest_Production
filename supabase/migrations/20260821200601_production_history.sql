alter view public.fleet_service_opportunities set (security_invoker = true);
alter view public.location_intelligence_snapshot set (security_invoker = true);
alter function public.fleet_dashboard_summary(uuid) set search_path = public, pg_catalog;
alter function public.has_fleet_access(uuid) set search_path = public, pg_catalog;
