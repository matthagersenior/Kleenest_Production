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
  v_route_length double precision;
  v_names text[] := '{}'::text[];
  v_match text := lower(coalesce(nullif(trim(p_amenity_match),''),'any'));
  v_coord jsonb;
  v_lng double precision;
  v_lat double precision;
  v_sample_radius integer;
  v_sample_count integer;
BEGIN
  IF p_route_geojson IS NULL OR jsonb_typeof(p_route_geojson)<>'object' OR p_route_geojson->>'type'<>'LineString' THEN RAISE EXCEPTION 'route must be a GeoJSON LineString' USING ERRCODE='22023'; END IF;
  IF octet_length(p_route_geojson::text)>500000 THEN RAISE EXCEPTION 'route payload is too large' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_route_geojson->'coordinates')<>'array' OR jsonb_array_length(p_route_geojson->'coordinates')<2 OR jsonb_array_length(p_route_geojson->'coordinates')>5000 THEN RAISE EXCEPTION 'route coordinate count must be between 2 and 5000' USING ERRCODE='22023'; END IF;
  FOR v_coord IN SELECT value FROM jsonb_array_elements(p_route_geojson->'coordinates') LOOP
    IF jsonb_typeof(v_coord)<>'array' OR jsonb_array_length(v_coord)<2 OR jsonb_typeof(v_coord->0)<>'number' OR jsonb_typeof(v_coord->1)<>'number' THEN RAISE EXCEPTION 'route contains an invalid coordinate' USING ERRCODE='22023'; END IF;
    v_lng := (v_coord->>0)::double precision;
    v_lat := (v_coord->>1)::double precision;
    IF v_lng < -180 OR v_lng > 180 OR v_lat < -90 OR v_lat > 90 THEN RAISE EXCEPTION 'route coordinate out of range' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_corridor_m IS NULL OR p_corridor_m < 100 OR p_corridor_m > 40234 THEN RAISE EXCEPTION 'corridor must be between 100 and 40234 meters' USING ERRCODE='22023'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN RAISE EXCEPTION 'limit must be between 1 and 50' USING ERRCODE='22023'; END IF;
  IF octet_length(coalesce(p_search,'')) > 320 THEN RAISE EXCEPTION 'search is too long' USING ERRCODE='22023'; END IF;
  IF lower(coalesce(nullif(trim(p_category),''),'restroom')) NOT IN ('restroom','all') THEN RAISE EXCEPTION 'unsupported category' USING ERRCODE='22023'; END IF;
  IF v_match NOT IN ('all','any') THEN RAISE EXCEPTION 'amenity match must be all or any' USING ERRCODE='22023'; END IF;
  IF cardinality(coalesce(p_amenity_names,'{}'::text[])) > 24 THEN RAISE EXCEPTION 'too many amenities' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_amenity_names,'{}'::text[])) n WHERE length(trim(n)) > 80) THEN RAISE EXCEPTION 'amenity name is too long' USING ERRCODE='22023'; END IF;

  SELECT coalesce(array_agg(name ORDER BY name),'{}'::text[]) INTO v_names
  FROM (
    SELECT DISTINCT lower(trim(n)) name
    FROM unnest(coalesce(p_amenity_names,'{}'::text[])) n
    WHERE nullif(trim(n),'') IS NOT NULL
  ) q;

  v_route := ST_SetSRID(ST_GeomFromGeoJSON(p_route_geojson::text),4326);
  IF GeometryType(v_route)<>'LINESTRING' OR ST_IsEmpty(v_route) OR NOT ST_IsValid(v_route) THEN RAISE EXCEPTION 'route geometry is invalid' USING ERRCODE='22023'; END IF;
  v_route_geog := v_route::geography;
  v_route_length := ST_Length(v_route_geog);
  IF v_route_length<=0 OR v_route_length>10000000 THEN RAISE EXCEPTION 'route length is outside supported bounds' USING ERRCODE='22023'; END IF;

  -- Raw public.locations remains closed to mobile callers. Sample the already
  -- sanitized nearby projection, then apply exact corridor geometry locally.
  v_sample_radius := least(402336, greatest(100000, p_corridor_m + 160000));
  v_sample_count := greatest(1, least(40, ceil(v_route_length / greatest(50000, 2.0 * (v_sample_radius - p_corridor_m)))::integer));

  RETURN QUERY
  WITH sample_points AS (
    SELECT ST_LineInterpolatePoint(v_route, g::double precision / v_sample_count::double precision) AS geom
    FROM generate_series(0,v_sample_count) g
  ),
  safe_rows AS (
    SELECT n
    FROM sample_points s
    CROSS JOIN LATERAL public.map_network_nearby_v2(
      ST_Y(s.geom),
      ST_X(s.geom),
      v_sample_radius,
      500,
      'all',
      p_search,
      '{}'::text[]
    ) n
  ),
  dedup AS (
    SELECT DISTINCT ON (n->>'location_id') n
    FROM safe_rows
    WHERE nullif(n->>'location_id','') IS NOT NULL
      AND (n->>'latitude') ~ '^-?[0-9]+(?:\.[0-9]+)?$'
      AND (n->>'longitude') ~ '^-?[0-9]+(?:\.[0-9]+)?$'
    ORDER BY n->>'location_id'
  ),
  scored AS (
    SELECT
      n,
      ST_SetSRID(ST_MakePoint((n->>'longitude')::double precision,(n->>'latitude')::double precision),4326) AS point_geom
    FROM dedup
    WHERE
      lower(coalesce(n->>'place_type','')) IN ('restroom','bathroom','toilet')
      OR lower(coalesce(n->>'category','')) IN ('restroom','bathroom','toilet')
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(n->'amenities','[]'::jsonb)) a
        WHERE lower(trim(coalesce(a->>'name',''))) IN ('public restroom','restroom','bathroom','toilet','toilets')
      )
  ),
  routed AS (
    SELECT
      n,
      ST_Distance(point_geom::geography,v_route_geog) AS route_dist,
      ST_LineLocatePoint(v_route,ST_ClosestPoint(v_route,point_geom)) AS route_pos
    FROM scored
  ),
  filtered AS (
    SELECT *
    FROM routed
    WHERE route_dist <= p_corridor_m
      AND (
        cardinality(v_names)=0
        OR (
          v_match='any'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(coalesce(n->'amenities','[]'::jsonb)) a
            WHERE lower(trim(coalesce(a->>'name','')))=ANY(v_names)
          )
        )
        OR (
          v_match='all'
          AND (
            SELECT count(DISTINCT lower(trim(coalesce(a->>'name',''))))
            FROM jsonb_array_elements(coalesce(n->'amenities','[]'::jsonb)) a
            WHERE lower(trim(coalesce(a->>'name','')))=ANY(v_names)
          )=cardinality(v_names)
        )
      )
    ORDER BY route_pos,route_dist
    LIMIT p_limit
  )
  SELECT n || jsonb_build_object(
    'category','restroom',
    'distance_to_route_meters',route_dist,
    'route_fraction',route_pos
  )
  FROM filtered
  ORDER BY route_pos,route_dist;
END
$function$;

REVOKE ALL ON FUNCTION public.map_network_along_route_v1(jsonb,integer,integer,text,text,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_network_along_route_v1(jsonb,integer,integer,text,text,text[],text) TO anon, authenticated;
