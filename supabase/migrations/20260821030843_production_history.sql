revoke all on table public.location_health from anon, authenticated;
revoke all on table public.pricing_authority_v1 from anon, authenticated;
revoke all on table public.restroom_intelligence from anon, authenticated;
revoke all on table public.fleet_service_opportunities from anon;

-- These are internal orchestration tables. Public clients must use the controlled RPC/API boundary.
revoke all on table public.location_verification_campaigns from anon, authenticated;
revoke all on table public.location_verification_targets from anon, authenticated;
