CREATE OR REPLACE FUNCTION public.map_network_nearby_v3(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer DEFAULT 30000,
  p_limit integer DEFAULT 50,
  p_category text DEFAULT 'restroom',
  p_search text DEFAULT NULL,
  p_amenity_names text[] DEFAULT '{}'::text[],
  p_amenity_match text DEFAULT 'any'
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
  v_origin geography;
  v_names text[] := '{}'::text[];
  v_match text := lower(coalesce(nullif(trim(p_amenity_match),''),'any'));
BEGIN
  IF p_lat IS NULL OR p_lat < -90 OR p_lat > 90 THEN RAISE EXCEPTION 'latitude out of range' USING ERRCODE='22023'; END IF;
  IF p_lng IS NULL OR p_lng < -180 OR p_lng > 180 THEN RAISE EXCEPTION 'longitude out of range' USING ERRCODE='22023'; END IF;
  IF p_radius_m IS NULL OR p_radius_m < 100 OR p_radius_m > 402336 THEN RAISE EXCEPTION 'radius must be between 100 and 402336 meters' USING ERRCODE='22023'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'limit must be between 1 and 100' USING ERRCODE='22023'; END IF;
  IF octet_length(coalesce(p_search,'')) > 320 THEN RAISE EXCEPTION 'search is too long' USING ERRCODE='22023'; END IF;
  IF lower(coalesce(nullif(trim(p_category),''),'restroom')) NOT IN ('restroom','all') THEN RAISE EXCEPTION 'unsupported category' USING ERRCODE='22023'; END IF;
  IF v_match NOT IN ('all','any') THEN RAISE EXCEPTION 'amenity match must be all or any' USING ERRCODE='22023'; END IF;
  IF cardinality(coalesce(p_amenity_names,'{}'::text[])) > 24 THEN RAISE EXCEPTION 'too many amenities' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_amenity_names,'{}'::text[])) n WHERE length(trim(n)) > 80) THEN RAISE EXCEPTION 'amenity name is too long' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(name ORDER BY name),'{}'::text[]) INTO v_names FROM (SELECT DISTINCT lower(trim(n)) name FROM unnest(coalesce(p_amenity_names,'{}'::text[])) n WHERE nullif(trim(n),'') IS NOT NULL) q;
  v_origin := ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::geography;

  RETURN QUERY
  WITH candidates AS (
    SELECT l.*, p.id AS place_id, p.name AS place_name, p.category AS place_category, p.rating AS place_rating, p.review_count AS place_review_count, p.is_verified AS place_verified,
      ST_Distance(l.geom,v_origin) AS dist
    FROM public.locations l
    LEFT JOIN LATERAL (
      SELECT pp.id,pp.name,pp.category,pp.rating,pp.review_count,pp.is_verified FROM public.places pp WHERE pp.location_id=l.id AND pp.is_active=true
      ORDER BY pp.is_verified DESC NULLS LAST, pp.id LIMIT 1
    ) p ON true
    WHERE l.is_active=true AND l.geom IS NOT NULL AND ST_DWithin(l.geom,v_origin,p_radius_m)
      AND (
        lower(coalesce(l.bathroom_verification_status,'')) IN ('has_bathroom','verified') OR lower(coalesce(l.place_type,'')) IN ('restroom','bathroom','toilet') OR lower(coalesce(p.category,'')) IN ('restroom','bathroom','toilet')
        OR lower(coalesce(l.source_metadata->'evidence'->>'amenity','')) IN ('toilets','restroom','bathroom') OR lower(coalesce(l.source_metadata->'evidence'->>'building',''))='toilets'
        OR lower(coalesce(l.source_metadata->'evidence'->>'toilets','')) IN ('yes','public','customers','permissive') OR lower(coalesce(l.source_metadata->>'amenity','')) IN ('toilets','restroom','bathroom')
        OR lower(coalesce(l.source_metadata->>'toilets','')) IN ('yes','public','customers','permissive') OR lower(coalesce(l.source_metadata->>'restroom','')) IN ('yes','public','customers','permissive')
        OR lower(coalesce(l.source_metadata->>'bathroom','')) IN ('yes','public','customers','permissive') OR coalesce(l.source_metadata->'osm_tags'->>'amenity','') ILIKE 'toilet%'
      )
      AND lower(coalesce(l.source_metadata->'evidence'->>'toilets:access',l.source_metadata->'evidence'->>'access',l.source_metadata->>'toilets:access',l.source_metadata->>'access','')) NOT IN ('private','no')
      AND lower(coalesce(l.source_metadata->'evidence'->>'toilets',l.source_metadata->>'toilets','')) NOT IN ('no','none')
      AND (nullif(trim(p_search),'') IS NULL OR coalesce(l.name,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(p.name,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(l.address,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(l.city,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(l.state,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(l.postal_code,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(l.source_metadata->>'brand','') ILIKE '%'||trim(p_search)||'%' OR coalesce(l.source_metadata->>'brand_name','') ILIKE '%'||trim(p_search)||'%')
      AND (cardinality(v_names)=0 OR
        (v_match='any' AND EXISTS (SELECT 1 FROM public.location_amenities la JOIN public.amenities a ON a.id=la.amenity_id WHERE la.location_id=l.id AND lower(trim(a.name))=ANY(v_names))) OR
        (v_match='all' AND (SELECT count(DISTINCT lower(trim(a.name))) FROM public.location_amenities la JOIN public.amenities a ON a.id=la.amenity_id WHERE la.location_id=l.id AND lower(trim(a.name))=ANY(v_names))=cardinality(v_names))
      )
    ORDER BY ST_Distance(l.geom,v_origin) LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'location_id',c.id,'place_id',c.place_id,'name',coalesce(c.place_name,c.name),'category','restroom','address',c.address,'city',c.city,'state',c.state,'postal_code',c.postal_code,
    'latitude',c.latitude,'longitude',c.longitude,'distance_meters',c.dist,'source',c.source,'source_dataset',c.source_dataset,'source_external_id',c.source_external_id,
    'is_verified',coalesce(c.place_verified,false),'rating',coalesce(c.place_rating,c.rating,0),'review_count',coalesce(c.place_review_count,c.review_count,0),'cleanliness_pct',c.cleanliness_pct,'verification_confidence',c.verification_confidence,
    'amenities',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('name',a.name,'category',a.category)) FROM public.location_amenities la JOIN public.amenities a ON a.id=la.amenity_id WHERE la.location_id=c.id),'[]'::jsonb),
    'fixtures',coalesce((SELECT jsonb_build_object('stalls',f.stalls,'urinals',f.urinals,'sinks',f.sinks,'hand_dryers',f.hand_dryers,'changing_tables',f.changing_tables,'showers',f.showers) FROM public.location_fixtures f WHERE f.location_id=c.id LIMIT 1),'{}'::jsonb),
    'brand',coalesce(c.source_metadata->>'brand',c.source_metadata->>'brand_name',c.source_metadata->'evidence'->>'brand'),'operator_name',coalesce(c.source_metadata->>'operator',c.source_metadata->>'operator_name',c.source_metadata->'evidence'->>'operator'),
    'osm_tags',coalesce(c.source_metadata->'osm_tags','{}'::jsonb),'business_id',coalesce(c.claimed_business_id,c.business_id),'business_name',NULL,'business_logo_url',NULL,
    'place_type',c.place_type,'phone',c.phone,'website',c.website,'description',c.description,'accessible',c.accessible,'changing_table',c.changing_table,'smart_bathroom',c.smart_bathroom,'cleaning_schedule',c.cleaning_schedule,'promo_offer',c.promo_offer
  ) FROM candidates c ORDER BY c.dist;
END
$function$;

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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public, extensions
AS $function$
DECLARE
  v_route geometry;
  v_route_geog geography;
  v_names text[] := '{}'::text[];
  v_match text := lower(coalesce(nullif(trim(p_amenity_match),''),'any'));
  v_coord jsonb;
  v_lng double precision;
  v_lat double precision;
BEGIN
  IF p_route_geojson IS NULL OR jsonb_typeof(p_route_geojson)<>'object' OR p_route_geojson->>'type'<>'LineString' THEN RAISE EXCEPTION 'route must be a GeoJSON LineString' USING ERRCODE='22023'; END IF;
  IF octet_length(p_route_geojson::text)>500000 THEN RAISE EXCEPTION 'route payload is too large' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_route_geojson->'coordinates')<>'array' OR jsonb_array_length(p_route_geojson->'coordinates')<2 OR jsonb_array_length(p_route_geojson->'coordinates')>5000 THEN RAISE EXCEPTION 'route coordinate count must be between 2 and 5000' USING ERRCODE='22023'; END IF;
  FOR v_coord IN SELECT value FROM jsonb_array_elements(p_route_geojson->'coordinates') LOOP
    IF jsonb_typeof(v_coord)<>'array' OR jsonb_array_length(v_coord)<2 OR jsonb_typeof(v_coord->0)<>'number' OR jsonb_typeof(v_coord->1)<>'number' THEN RAISE EXCEPTION 'route contains an invalid coordinate' USING ERRCODE='22023'; END IF;
    v_lng := (v_coord->>0)::double precision; v_lat := (v_coord->>1)::double precision;
    IF v_lng < -180 OR v_lng > 180 OR v_lat < -90 OR v_lat > 90 THEN RAISE EXCEPTION 'route coordinate out of range' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_corridor_m IS NULL OR p_corridor_m < 100 OR p_corridor_m > 40234 THEN RAISE EXCEPTION 'corridor must be between 100 and 40234 meters' USING ERRCODE='22023'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN RAISE EXCEPTION 'limit must be between 1 and 50' USING ERRCODE='22023'; END IF;
  IF octet_length(coalesce(p_search,'')) > 320 THEN RAISE EXCEPTION 'search is too long' USING ERRCODE='22023'; END IF;
  IF lower(coalesce(nullif(trim(p_category),''),'restroom')) NOT IN ('restroom','all') THEN RAISE EXCEPTION 'unsupported category' USING ERRCODE='22023'; END IF;
  IF v_match NOT IN ('all','any') THEN RAISE EXCEPTION 'amenity match must be all or any' USING ERRCODE='22023'; END IF;
  IF cardinality(coalesce(p_amenity_names,'{}'::text[])) > 24 THEN RAISE EXCEPTION 'too many amenities' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_amenity_names,'{}'::text[])) n WHERE length(trim(n)) > 80) THEN RAISE EXCEPTION 'amenity name is too long' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(name ORDER BY name),'{}'::text[]) INTO v_names FROM (SELECT DISTINCT lower(trim(n)) name FROM unnest(coalesce(p_amenity_names,'{}'::text[])) n WHERE nullif(trim(n),'') IS NOT NULL) q;
  v_route := ST_SetSRID(ST_GeomFromGeoJSON(p_route_geojson::text),4326);
  IF GeometryType(v_route)<>'LINESTRING' OR ST_IsEmpty(v_route) OR NOT ST_IsValid(v_route) THEN RAISE EXCEPTION 'route geometry is invalid' USING ERRCODE='22023'; END IF;
  v_route_geog := v_route::geography;
  IF ST_Length(v_route_geog)<=0 OR ST_Length(v_route_geog)>10000000 THEN RAISE EXCEPTION 'route length is outside supported bounds' USING ERRCODE='22023'; END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT l.*,p.id AS place_id,p.name AS place_name,p.rating AS place_rating,p.review_count AS place_review_count,p.is_verified AS place_verified,
      ST_Distance(l.geom,v_route_geog) AS route_dist,ST_LineLocatePoint(v_route,ST_ClosestPoint(v_route,l.geom::geometry)) AS route_pos
    FROM public.locations l
    LEFT JOIN LATERAL (SELECT pp.id,pp.name,pp.rating,pp.review_count,pp.is_verified,pp.category FROM public.places pp WHERE pp.location_id=l.id AND pp.is_active=true ORDER BY pp.is_verified DESC NULLS LAST,pp.id LIMIT 1) p ON true
    WHERE l.is_active=true AND l.geom IS NOT NULL AND ST_DWithin(l.geom,v_route_geog,p_corridor_m)
      AND (
        lower(coalesce(l.bathroom_verification_status,'')) IN ('has_bathroom','verified') OR lower(coalesce(l.place_type,'')) IN ('restroom','bathroom','toilet') OR lower(coalesce(p.category,'')) IN ('restroom','bathroom','toilet')
        OR lower(coalesce(l.source_metadata->'evidence'->>'amenity','')) IN ('toilets','restroom','bathroom') OR lower(coalesce(l.source_metadata->'evidence'->>'building',''))='toilets' OR lower(coalesce(l.source_metadata->'evidence'->>'toilets','')) IN ('yes','public','customers','permissive')
        OR lower(coalesce(l.source_metadata->>'amenity','')) IN ('toilets','restroom','bathroom') OR lower(coalesce(l.source_metadata->>'toilets','')) IN ('yes','public','customers','permissive') OR lower(coalesce(l.source_metadata->>'restroom','')) IN ('yes','public','customers','permissive')
        OR lower(coalesce(l.source_metadata->>'bathroom','')) IN ('yes','public','customers','permissive') OR coalesce(l.source_metadata->'osm_tags'->>'amenity','') ILIKE 'toilet%'
      )
      AND lower(coalesce(l.source_metadata->'evidence'->>'toilets:access',l.source_metadata->'evidence'->>'access',l.source_metadata->>'toilets:access',l.source_metadata->>'access','')) NOT IN ('private','no')
      AND lower(coalesce(l.source_metadata->'evidence'->>'toilets',l.source_metadata->>'toilets','')) NOT IN ('no','none')
      AND (nullif(trim(p_search),'') IS NULL OR coalesce(l.name,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(p.name,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(l.address,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(l.city,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(l.state,'') ILIKE '%'||trim(p_search)||'%' OR coalesce(l.source_metadata->>'brand','') ILIKE '%'||trim(p_search)||'%')
      AND (cardinality(v_names)=0 OR (v_match='any' AND EXISTS (SELECT 1 FROM public.location_amenities la JOIN public.amenities a ON a.id=la.amenity_id WHERE la.location_id=l.id AND lower(trim(a.name))=ANY(v_names))) OR (v_match='all' AND (SELECT count(DISTINCT lower(trim(a.name))) FROM public.location_amenities la JOIN public.amenities a ON a.id=la.amenity_id WHERE la.location_id=l.id AND lower(trim(a.name))=ANY(v_names))=cardinality(v_names)))
    ORDER BY route_pos,route_dist LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'location_id',c.id,'place_id',c.place_id,'name',coalesce(c.place_name,c.name),'category','restroom','address',c.address,'city',c.city,'state',c.state,'postal_code',c.postal_code,
    'latitude',c.latitude,'longitude',c.longitude,'distance_to_route_meters',c.route_dist,'route_fraction',c.route_pos,'source',c.source,'source_dataset',c.source_dataset,'source_external_id',c.source_external_id,
    'is_verified',coalesce(c.place_verified,false),'rating',coalesce(c.place_rating,c.rating,0),'review_count',coalesce(c.place_review_count,c.review_count,0),'cleanliness_pct',c.cleanliness_pct,'verification_confidence',c.verification_confidence,
    'amenities',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('name',a.name,'category',a.category)) FROM public.location_amenities la JOIN public.amenities a ON a.id=la.amenity_id WHERE la.location_id=c.id),'[]'::jsonb),
    'fixtures',coalesce((SELECT jsonb_build_object('stalls',f.stalls,'urinals',f.urinals,'sinks',f.sinks,'hand_dryers',f.hand_dryers,'changing_tables',f.changing_tables,'showers',f.showers) FROM public.location_fixtures f WHERE f.location_id=c.id LIMIT 1),'{}'::jsonb),
    'brand',coalesce(c.source_metadata->>'brand',c.source_metadata->>'brand_name',c.source_metadata->'evidence'->>'brand'),'operator_name',coalesce(c.source_metadata->>'operator',c.source_metadata->>'operator_name'),
    'osm_tags',coalesce(c.source_metadata->'osm_tags','{}'::jsonb),'business_id',coalesce(c.claimed_business_id,c.business_id),'business_name',NULL,'business_logo_url',NULL,'place_type',c.place_type,'phone',c.phone,'website',c.website,'description',c.description,
    'accessible',c.accessible,'changing_table',c.changing_table,'smart_bathroom',c.smart_bathroom,'cleaning_schedule',c.cleaning_schedule,'promo_offer',c.promo_offer
  ) FROM candidates c ORDER BY c.route_pos,c.route_dist;
END
$function$;

REVOKE ALL ON FUNCTION public.map_network_nearby_v3(double precision,double precision,integer,integer,text,text,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_network_nearby_v3(double precision,double precision,integer,integer,text,text,text[],text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.map_network_along_route_v1(jsonb,integer,integer,text,text,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_network_along_route_v1(jsonb,integer,integer,text,text,text[],text) TO anon, authenticated;
