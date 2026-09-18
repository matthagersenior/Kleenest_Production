-- A GRANT TO PUBLIC also grants anon/authenticated. Remove that broad grant from every SECURITY DEFINER function.
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
      AND has_function_privilege('public', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC', r.schema_name, r.proname, r.args);
  END LOOP;
END $$;

-- Re-establish only intentionally public discovery functions.
GRANT EXECUTE ON FUNCTION public.get_amenities_catalog() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nearby_locations(double precision, double precision, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_location_details(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_location_bathroom_verification(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_leaderboard(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_leaderboard(integer) TO anon, authenticated;
