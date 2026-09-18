-- Keep the existing Fleet service-opportunity view usable by the canonical workspace while making its rows business-scoped.
CREATE OR REPLACE VIEW public.fleet_service_opportunities
WITH (security_barrier=true)
AS
SELECT l.id AS location_id,
       l.name,
       l.latitude,
       l.longitude,
       l.business_id,
       l.bathroom_verification_status,
       l.rating,
       l.accessible,
       l.changing_table,
       COALESCE(la.amenity_count,0::bigint) AS amenity_count,
       COALESCE(lq.observation_count,0::bigint) AS quality_observation_count,
       CASE WHEN l.bathroom_verification_status = ANY (ARRAY['verified'::text,'user_verified'::text,'business_verified'::text]) THEN 1 ELSE 0 END AS verified_bathroom,
       CASE WHEN COALESCE(lq.observation_count,0::bigint)=0 THEN 1 ELSE 0 END AS needs_fresh_observation
FROM public.locations l
LEFT JOIN (SELECT location_amenities.location_id,count(*) AS amenity_count FROM public.location_amenities GROUP BY location_amenities.location_id) la ON la.location_id=l.id
LEFT JOIN (SELECT location_quality_observations.location_id,count(*) AS observation_count FROM public.location_quality_observations GROUP BY location_quality_observations.location_id) lq ON lq.location_id=l.id
WHERE COALESCE(l.is_active,true)=true
  AND public.has_fleet_access(l.business_id);

REVOKE ALL ON public.fleet_service_opportunities FROM anon;
GRANT SELECT ON public.fleet_service_opportunities TO authenticated;
