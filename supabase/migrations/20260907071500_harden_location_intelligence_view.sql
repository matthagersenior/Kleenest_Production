-- Ensure the exposed intelligence view evaluates permissions and RLS as the caller.
alter view public.location_intelligence_snapshot
  set (security_invoker = true);
