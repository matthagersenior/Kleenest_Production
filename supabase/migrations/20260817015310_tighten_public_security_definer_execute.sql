REVOKE EXECUTE ON FUNCTION public.get_business_leaderboard(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_location_bathroom_verification(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_location_details(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_leaderboard(integer) FROM anon;

-- These catalog/discovery functions are intentionally public because the consumer shell can use them before authentication.
-- Keep their SECURITY DEFINER posture for now, but constrain them separately in the next function-definition audit.
