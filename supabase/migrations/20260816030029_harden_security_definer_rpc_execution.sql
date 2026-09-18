-- Security-definer functions must never be callable by anonymous clients by default.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname AS schema_name, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon', r.schema_name, r.proname, r.args);
  END LOOP;
END $$;

-- Explicitly retain only the intentionally public, read-only discovery RPCs.
GRANT EXECUTE ON FUNCTION public.get_amenities_catalog() TO anon;
GRANT EXECUTE ON FUNCTION public.nearby_locations(double precision, double precision, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_location_details(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_location_bathroom_verification(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_business_leaderboard(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_leaderboard(integer) TO anon;
