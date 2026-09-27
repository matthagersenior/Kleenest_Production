CREATE SCHEMA IF NOT EXISTS kleenest_api_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA kleenest_api_private FROM PUBLIC;
GRANT USAGE ON SCHEMA kleenest_api_private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION kleenest_api_private.map_network_nearby_all_core_v1(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer DEFAULT 8047,
  p_limit integer DEFAULT 500,
  p_search text DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
  v_origin geography;
BEGIN
  IF p_lat IS NULL OR p_lat < -90 OR p_lat > 90 THEN
    RAISE EXCEPTION 'latitude out of range' USING ERRCODE='22023';
  END IF;
  IF p_lng IS NULL OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'longitude out of range' USING ERRCODE='22023';
  END IF;
  IF p_radius_m IS NULL OR p_radius_m < 100 OR p_radius_m > 402336 THEN
    RAISE EXCEPTION 'radius must be between 100 and 402336 meters' USING ERRCODE='22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 2000 THEN
    RAISE EXCEPTION 'limit must be between 1 and 2000' USING ERRCODE='22023';
  END IF;
  IF octet_length(coalesce(p_search,'')) > 320 THEN
    RAISE EXCEPTION 'search is too long' USING ERRCODE='22023';
  END IF;

  v_origin := ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::geography;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      l.id AS location_id,
      p.id AS place_id,
      coalesce(p.name,l.name,'Kleenest place') AS name,
      CASE
        WHEN lower(coalesce(p.category,l.place_type,'')) IN ('library','library_dropoff') THEN 'government'
        WHEN coalesce(l.source_metadata->>'brand',l.source_metadata->>'brand_name',l.source_metadata->'evidence'->>'brand') IS NOT NULL
             AND lower(coalesce(p.category,l.place_type,''))='service' THEN 'brand'
        ELSE coalesce(nullif(p.category,''),nullif(l.place_type,''),'service')
      END AS category,
      l.address,l.city,l.state,l.postal_code,l.latitude,l.longitude,
      ST_Distance(l.geom,v_origin) AS distance_meters,
      l.source,l.source_dataset,l.source_external_id,
      coalesce(p.is_verified,false) AS is_verified,
      coalesce(p.rating,l.rating,0) AS rating,
      coalesce(p.review_count,l.review_count,0) AS review_count,
      l.cleanliness_pct,l.verification_confidence,
      l.verification_status::text AS verification_status,
      l.bathroom_verification_status,l.bathroom_verified_at,l.verification_observation_count,l.updated_at,
      coalesce(l.source_metadata->>'brand',l.source_metadata->>'brand_name',l.source_metadata->'evidence'->>'brand') AS brand,
      coalesce(l.source_metadata->>'operator',l.source_metadata->>'operator_name',l.source_metadata->'evidence'->>'operator') AS operator_name,
      coalesce(l.source_metadata->'osm_tags','{}'::jsonb) AS osm_tags,
      coalesce(l.claimed_business_id,l.business_id) AS business_id,
      l.place_type,l.phone,l.website,l.description,l.accessible,l.changing_table,l.smart_bathroom,l.cleaning_schedule,l.promo_offer
    FROM public.locations l
    LEFT JOIN LATERAL (
      SELECT pp.id,pp.name,pp.category,pp.is_verified,pp.rating,pp.review_count
      FROM public.places pp
      WHERE pp.location_id=l.id AND pp.is_active=true
      ORDER BY pp.is_verified DESC, pp.id
      LIMIT 1
    ) p ON true
    WHERE l.is_active=true
      AND l.geom IS NOT NULL
      AND ST_DWithin(l.geom,v_origin,p_radius_m)
      AND (
        nullif(trim(p_search),'') IS NULL
        OR coalesce(l.name,'') ILIKE '%'||p_search||'%'
        OR coalesce(p.name,'') ILIKE '%'||p_search||'%'
        OR coalesce(l.address,'') ILIKE '%'||p_search||'%'
        OR coalesce(l.city,'') ILIKE '%'||p_search||'%'
        OR coalesce(l.state,'') ILIKE '%'||p_search||'%'
        OR coalesce(l.postal_code,'') ILIKE '%'||p_search||'%'
        OR coalesce(l.source_metadata->>'brand','') ILIKE '%'||p_search||'%'
        OR coalesce(l.source_metadata->>'brand_name','') ILIKE '%'||p_search||'%'
        OR coalesce(l.source_metadata->>'operator','') ILIKE '%'||p_search||'%'
        OR coalesce(l.source_metadata->>'operator_name','') ILIKE '%'||p_search||'%'
      )
    ORDER BY distance_meters
    LIMIT p_limit
  ),
  enriched AS (
    SELECT
      c.*,
      b.name AS business_name,
      b.logo_url AS business_logo_url,
      b.business_tier::text AS business_tier,
      b.id IS NOT NULL AS kleenest_business,
      coalesce(a.items,'[]'::jsonb) AS amenities,
      coalesce(f.items,'{}'::jsonb) AS fixtures
    FROM candidates c
    LEFT JOIN public.businesses b ON b.id=c.business_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT jsonb_build_object('name',aa.name,'category',aa.category)) AS items
      FROM public.location_amenities la
      JOIN public.amenities aa ON aa.id=la.amenity_id
      WHERE la.location_id=c.location_id
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'stalls',lf.stalls,'urinals',lf.urinals,'sinks',lf.sinks,'hand_dryers',lf.hand_dryers,
        'changing_tables',lf.changing_tables,'showers',lf.showers
      ) AS items
      FROM public.location_fixtures lf
      WHERE lf.location_id=c.location_id
      LIMIT 1
    ) f ON true
  )
  SELECT jsonb_build_object(
    'location_id',e.location_id,'place_id',e.place_id,'name',e.name,'category',e.category,
    'address',e.address,'city',e.city,'state',e.state,'postal_code',e.postal_code,
    'latitude',e.latitude,'longitude',e.longitude,'distance_meters',e.distance_meters,
    'source',e.source,'source_dataset',e.source_dataset,'source_external_id',e.source_external_id,
    'is_verified',e.is_verified,'rating',e.rating,'review_count',e.review_count,
    'cleanliness_pct',e.cleanliness_pct,'verification_confidence',e.verification_confidence,
    'confidence',e.verification_confidence,'verification_status',e.verification_status,
    'restroom_verification_status',e.bathroom_verification_status,'last_verified_at',e.bathroom_verified_at,
    'observation_count',e.verification_observation_count,'freshness_at',e.updated_at,
    'amenities',e.amenities,'fixtures',e.fixtures,'brand',e.brand,'operator_name',e.operator_name,'osm_tags',e.osm_tags,
    'business_id',e.business_id,'business_name',e.business_name,'business_logo_url',e.business_logo_url,
    'business_tier',e.business_tier,'kleenest_business',e.kleenest_business,'place_type',e.place_type,
    'phone',e.phone,'website',e.website,'description',e.description,'accessible',e.accessible,
    'changing_table',e.changing_table,'smart_bathroom',e.smart_bathroom,'cleaning_schedule',e.cleaning_schedule,'promo_offer',e.promo_offer
  )
  FROM enriched e
  ORDER BY e.distance_meters;
END
$function$;

REVOKE ALL ON FUNCTION kleenest_api_private.map_network_nearby_all_core_v1(double precision,double precision,integer,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kleenest_api_private.map_network_nearby_all_core_v1(double precision,double precision,integer,integer,text)
  TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.map_network_nearby_all_v1(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer DEFAULT 8047,
  p_limit integer DEFAULT 500,
  p_search text DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
  SELECT *
  FROM kleenest_api_private.map_network_nearby_all_core_v1(p_lat,p_lng,p_radius_m,p_limit,p_search);
$wrapper$;

REVOKE ALL ON FUNCTION public.map_network_nearby_all_v1(double precision,double precision,integer,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_network_nearby_all_v1(double precision,double precision,integer,integer,text)
  TO anon,authenticated,service_role;
