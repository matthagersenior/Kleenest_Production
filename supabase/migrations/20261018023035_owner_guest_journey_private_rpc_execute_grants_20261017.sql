-- Owner Guest Insights public SECURITY INVOKER wrappers call guarded private
-- SECURITY DEFINER routines. Each private routine checks auth.uid() and
-- public.is_platform_owner_session() before returning any owner-only data.
-- Grant only the authenticated role; anonymous users remain denied.
GRANT EXECUTE ON FUNCTION private.owner_guest_journey_snapshot(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owner_guest_journey_session(text) TO authenticated;
