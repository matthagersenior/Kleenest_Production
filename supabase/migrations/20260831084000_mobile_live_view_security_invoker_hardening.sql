alter view public.activity_events set (security_invoker = true);
alter view public.location_health set (security_invoker = true);
alter view public.pricing_authority_v1 set (security_invoker = true);
alter view public.restroom_intelligence set (security_invoker = true);

revoke all on table public.activity_events from public, anon, authenticated;
revoke all on table public.location_health from public, anon, authenticated;
revoke all on table public.pricing_authority_v1 from public, anon, authenticated;
revoke all on table public.restroom_intelligence from public, anon, authenticated;
