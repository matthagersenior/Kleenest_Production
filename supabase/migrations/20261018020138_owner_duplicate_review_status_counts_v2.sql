CREATE OR REPLACE VIEW public.owner_location_duplicate_review_counts
WITH (security_invoker = true) AS
SELECT status, count(*)::bigint AS case_count
FROM public.location_duplicate_cases
GROUP BY status;
REVOKE ALL ON public.owner_location_duplicate_review_counts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.owner_location_duplicate_review_counts TO authenticated;
COMMENT ON VIEW public.owner_location_duplicate_review_counts IS
'Owner-only review progress: invoker RLS on location_duplicate_cases prevents non-owner access.';