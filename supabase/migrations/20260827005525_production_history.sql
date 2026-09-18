alter view public.location_bathroom_signals set (security_invoker = true);
alter function public.capability_retirement_audit() set search_path = public, pg_catalog;
alter function public.capability_retirement_audit(integer) set search_path = public, pg_catalog;
revoke execute on function public.capability_retirement_audit(integer) from anon, authenticated;
