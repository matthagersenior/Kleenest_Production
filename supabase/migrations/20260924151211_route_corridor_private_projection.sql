CREATE SCHEMA IF NOT EXISTS kleenest_api_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA kleenest_api_private FROM PUBLIC;
GRANT USAGE ON SCHEMA kleenest_api_private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION kleenest_api_private.map_network_along_route_core_v1(
  p_route_geojson jsonb,
  p_corridor_m integer DEFAULT 16093,
  p_limit integer DEFAULT 40,
  p_category text DEFAULT 'restroom',
  p_search text DEFAULT NULL,
  p_amenity_names text[] DEFAULT '{}'::text[],
  p_amenity_match text DEFAULT 'any'
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
  v_route geometry;
  v_route_geog geography;
  v_route_length double precision;
  v_names text[] := '{}'::text[];
  v_match text := lower(coalesce(nullif(trim(p_amenity_match),''),'any'));
  v_category text := lower(coalesce(nullif(trim(p_category),''),'restroom'));
  v_coord jsonb;
  v_lng double precision;
  v_lat double precision;
BEGIN
  IF p_route_geojson IS NULL OR jsonb_typeof(p_route_geojson)<>'object' OR p_route_geojson->>'type'<>'LineString' THEN
    RAISE EXCEPTION 'route must be a GeoJSON LineString' USING ERRCODE='22023';
  END IF;
  IF octet_length(p_route_geojson::text)>500000 THEN
    RAISE EXCEPTION 'route payload is too large' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_route_geojson->'coordinates')<>'array'
     OR jsonb_array_length(p_route_geojson->'coordinates')<2
     OR jsonb_array_length(p_route_geojson->'coordinates')>5000 THEN
    RAISE EXCEPTION 'route coordinate count must be between 2 and 5000' USING ERRCODE='22023';
  END IF;

  FOR v_coord IN SELECT value FROM jsonb_array_elements(p_route_geojson->'coordinates') LOOP
    IF jsonb_typeof(v_coord)<>'array'
       OR jsonb_array_length(v_coord)<2
       OR jsonb_typeof(v_coord->0)<>'number'
       OR jsonb_typeof(v_coord->1)<>'number' THEN
      RAISE EXCEPTION 'route contains an invalid coordinate' USING ERRCODE='22023';
    END IF;
    v_lng := (v_coord->>0)::double precision;
    v_lat := (v_coord->>1)::double precision;
    IF v_lng < -180 OR v_lng > 180 OR v_lat < -90 OR v_lat > 90 THEN
      RAISE EXCEPTION 'route coordinate out of range' USING ERRCODE='22023';
    END IF;
  END LOOP;

  IF p_corridor_m IS NULL OR p_corridor_m < 100 OR p_corridor_m > 40234 THEN
    RAISE EXCEPTION 'corridor must be between 100 and 40234 meters' USING ERRCODE='22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 250 THEN
    RAISE EXCEPTION 'limit must be between 1 and 250' USING ERRCODE='22023';
  END IF;
  IF octet_length(coalesce(p_search,'')) > 320 THEN
    RAISE EXCEPTION 'search is too long' USING ERRCODE='22023';
  END IF;
  IF v_category NOT IN ('restroom','all') THEN
    RAISE EXCEPTION 'unsupported category' USING ERRCODE='22023';
  END IF;
  IF v_match NOT IN ('all','any') THEN
    RAISE EXCEPTION 'amenity match must be all or any' USING ERRCODE='22023';
  END IF;
  IF cardinality(coalesce(p_amenity_names,'{}'::text[])) > 24 THEN
    RAISE EXCEPTION 'too many amenities' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_amenity_names,'{}'::text[])) n
    WHERE length(trim(n)) > 80
  ) THEN
    RAISE EXCEPTION 'amenity name is too long' USING ERRCODE='22023';
  END IF;

  SELECT coalesce(array_agg(name ORDER BY name),'{}'::text[])
    INTO v_names
  FROM (
    SELECT DISTINCT lower(trim(n)) name
    FROM unnest(coalesce(p_amenity_names,'{}'::text[])) n
    WHERE nullif(trim(n),'') IS NOT NULL
  ) q;

  v_route := ST_SetSRID(ST_GeomFromGeoJSON(p_route_geojson::text),4326);
  IF GeometryType(v_route)<>'LINESTRING' OR ST_IsEmpty(v_route) OR NOT ST_IsValid(v_route) THEN
    RAISE EXCEPTION 'route geometry is invalid' USING ERRCODE='22023';
  END IF;
  v_route_geog := v_route::geography;
  v_route_length := ST_Length(v_route_geog);
  IF v_route_length<=0 OR v_route_length>10000000 THEN
    RAISE EXCEPTION 'route length is outside supported bounds' USING ERRCODE='22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      l.id AS location_id,
      p.id AS place_id,
      coalesce(p.name,l.name,'Kleenest place') AS name,
      CASE
        WHEN v_category='restroom' THEN 'restroom'
        WHEN lower(coalesce(p.category,l.place_type,'')) IN ('library','library_dropoff') THEN 'government'
        WHEN coalesce(l.source_metadata->>'brand',l.source_metadata->>'brand_name',l.source_metadata->'evidence'->>'brand') IS NOT NULL
             AND lower(coalesce(p.category,l.place_type,''))='service' THEN 'brand'
        ELSE coalesce(nullif(p.category,''),nullif(l.place_type,''),'service')
      END AS category,
      l.address,
      l.city,
      l.state,
      l.postal_code,
      l.latitude,
      l.longitude,
      ST_Distance(l.geom,v_route_geog) AS route_dist,
      ST_LineLocatePoint(v_route,ST_ClosestPoint(v_route,l.geom::geometry)) AS route_pos,
      l.source,
      l.source_dataset,
      l.source_external_id,
      coalesce(p.is_verified,false) AS is_verified,
      coalesce(p.rating,l.rating,0) AS rating,
      coalesce(p.review_count,l.review_count,0) AS review_count,
      l.cleanliness_pct,
      l.verification_confidence,
      l.verification_status::text AS verification_status,
      l.bathroom_verification_status,
      l.bathroom_verified_at,
      l.verification_observation_count,
      l.updated_at,
      coalesce(l.source_metadata->>'brand',l.source_metadata->>'brand_name',l.source_metadata->'evidence'->>'brand') AS brand,
      coalesce(l.source_metadata->>'operator',l.source_metadata->>'operator_name',l.source_metadata->'evidence'->>'operator') AS operator_name,
      coalesce(l.source_metadata->'osm_tags','{}'::jsonb) AS osm_tags,
      coalesce(l.claimed_business_id,l.business_id) AS business_id,
      l.place_type,
      l.phone,
      l.website,
      l.description,
      l.accessible,
      l.changing_table,
      l.smart_bathroom,
      l.cleaning_schedule,
      l.promo_offer
    FROM public.locations l
    LEFT JOIN public.places p
      ON p.location_id=l.id
     AND p.is_active=true
    WHERE l.is_active=true
      AND l.geom IS NOT NULL
      AND ST_DWithin(l.geom,v_route_geog,p_corridor_m)
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
      AND (
        v_category='all'
        OR (
          lower(coalesce(l.source_metadata->'evidence'->>'toilets:access',l.source_metadata->'evidence'->>'access',l.source_metadata->>'toilets:access',l.source_metadata->>'access','')) NOT IN ('private','no')
          AND lower(coalesce(l.source_metadata->'evidence'->>'toilets',l.source_metadata->>'toilets','')) NOT IN ('no','none')
          AND (
            lower(coalesce(l.bathroom_verification_status,'')) IN ('has_bathroom','verified')
            OR lower(coalesce(l.place_type,'')) IN ('restroom','bathroom','toilet')
            OR lower(coalesce(p.category,'')) IN ('restroom','bathroom','toilet')
            OR lower(coalesce(l.source_metadata->'evidence'->>'amenity','')) IN ('toilets','restroom','bathroom')
            OR lower(coalesce(l.source_metadata->'evidence'->>'building',''))='toilets'
            OR lower(coalesce(l.source_metadata->'evidence'->>'toilets','')) IN ('yes','public','customers','permissive')
            OR lower(coalesce(l.source_metadata->>'amenity','')) IN ('toilets','restroom','bathroom')
            OR lower(coalesce(l.source_metadata->>'toilets','')) IN ('yes','public','customers','permissive')
            OR lower(coalesce(l.source_metadata->>'restroom','')) IN ('yes','public','customers','permissive')
            OR lower(coalesce(l.source_metadata->>'bathroom','')) IN ('yes','public','customers','permissive')
            OR coalesce(l.source_metadata->'osm_tags'->>'amenity','') ILIKE 'toilet%'
            OR EXISTS (
              SELECT 1
              FROM public.location_amenities la
              JOIN public.amenities aa ON aa.id=la.amenity_id
              WHERE la.location_id=l.id
                AND lower(trim(aa.name)) IN ('public restroom','restroom','bathroom','toilet','toilets')
            )
          )
        )
      )
      AND (
        cardinality(v_names)=0
        OR (
          v_match='any'
          AND EXISTS (
            SELECT 1
            FROM public.location_amenities la
            JOIN public.amenities aa ON aa.id=la.amenity_id
            WHERE la.location_id=l.id
              AND lower(trim(aa.name))=ANY(v_names)
          )
        )
        OR (
          v_match='all'
          AND (
            SELECT count(DISTINCT lower(trim(aa.name)))
            FROM public.location_amenities la
            JOIN public.amenities aa ON aa.id=la.amenity_id
            WHERE la.location_id=l.id
              AND lower(trim(aa.name))=ANY(v_names)
          )=cardinality(v_names)
        )
      )
    ORDER BY route_pos,route_dist
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
      coalesce(a.names,'{}'::text[]) AS amenity_names,
      coalesce(
        jsonb_build_object(
          'stalls',f.stalls,
          'urinals',f.urinals,
          'sinks',f.sinks,
          'hand_dryers',f.hand_dryers,
          'changing_tables',f.changing_tables,
          'showers',f.showers
        ),
        '{}'::jsonb
      ) AS fixtures
    FROM candidates c
    LEFT JOIN public.businesses b ON b.id=c.business_id
    LEFT JOIN LATERAL (
      SELECT
        jsonb_agg(DISTINCT jsonb_build_object('name',aa.name,'category',aa.category)) AS items,
        array_agg(DISTINCT aa.name ORDER BY aa.name) AS names
      FROM public.location_amenities la
      JOIN public.amenities aa ON aa.id=la.amenity_id
      WHERE la.location_id=c.location_id
    ) a ON true
    LEFT JOIN public.location_fixtures f ON f.location_id=c.location_id
  )
  SELECT jsonb_build_object(
    'location_id',e.location_id,
    'place_id',e.place_id,
    'name',e.name,
    'category',e.category,
    'address',e.address,
    'city',e.city,
    'state',e.state,
    'postal_code',e.postal_code,
    'latitude',e.latitude,
    'longitude',e.longitude,
    'distance_meters',e.route_dist,
    'distance_to_route_meters',e.route_dist,
    'route_fraction',e.route_pos,
    'source',e.source,
    'source_dataset',e.source_dataset,
    'source_external_id',e.source_external_id,
    'is_verified',e.is_verified,
    'rating',e.rating,
    'review_count',e.review_count,
    'cleanliness_pct',e.cleanliness_pct,
    'verification_confidence',e.verification_confidence,
    'confidence',e.verification_confidence,
    'verification_status',e.verification_status,
    'restroom_verification_status',e.bathroom_verification_status,
    'last_verified_at',e.bathroom_verified_at,
    'observation_count',e.verification_observation_count,
    'freshness_at',e.updated_at,
    'amenities',e.amenities,
    'amenity_names',to_jsonb(e.amenity_names),
    'fixtures',e.fixtures,
    'brand',e.brand,
    'operator_name',e.operator_name,
    'osm_tags',e.osm_tags,
    'business_id',e.business_id,
    'business_name',e.business_name,
    'business_logo_url',e.business_logo_url,
    'business_tier',e.business_tier,
    'kleenest_business',e.kleenest_business,
    'place_type',e.place_type,
    'phone',e.phone,
    'website',e.website,
    'description',e.description,
    'accessible',e.accessible,
    'changing_table',e.changing_table,
    'smart_bathroom',e.smart_bathroom,
    'cleaning_schedule',e.cleaning_schedule,
    'promo_offer',e.promo_offer
  )
  FROM enriched e
  ORDER BY e.route_pos,e.route_dist;
END
$function$;

REVOKE ALL ON FUNCTION kleenest_api_private.map_network_along_route_core_v1(jsonb,integer,integer,text,text,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kleenest_api_private.map_network_along_route_core_v1(jsonb,integer,integer,text,text,text[],text)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.map_network_along_route_v1(
  p_route_geojson jsonb,
  p_corridor_m integer DEFAULT 16093,
  p_limit integer DEFAULT 40,
  p_category text DEFAULT 'restroom',
  p_search text DEFAULT NULL,
  p_amenity_names text[] DEFAULT '{}'::text[],
  p_amenity_match text DEFAULT 'any'
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
  SELECT *
  FROM kleenest_api_private.map_network_along_route_core_v1(
    p_route_geojson,
    p_corridor_m,
    p_limit,
    p_category,
    p_search,
    p_amenity_names,
    p_amenity_match
  );
$wrapper$;

REVOKE ALL ON FUNCTION public.map_network_along_route_v1(jsonb,integer,integer,text,text,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_network_along_route_v1(jsonb,integer,integer,text,text,text[],text)
  TO anon, authenticated, service_role;
