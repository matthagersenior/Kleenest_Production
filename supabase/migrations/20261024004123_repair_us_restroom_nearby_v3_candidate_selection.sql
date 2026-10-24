-- Correct the v3 restroom search: filter bathroom evidence before applying the requested result limit.
CREATE OR REPLACE FUNCTION public.map_network_nearby_v3(p_lat double precision, p_lng double precision, p_radius_m integer DEFAULT 30000, p_limit integer DEFAULT 50, p_category text DEFAULT 'restroom'::text, p_search text DEFAULT NULL::text, p_amenity_names text[] DEFAULT '{}'::text[], p_amenity_match text DEFAULT 'any'::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_names text[]:='{}'::text[]; v_match text:=lower(coalesce(nullif(trim(p_amenity_match),''),'any')); v_category text:=lower(coalesce(nullif(trim(p_category),''),'restroom'));
BEGIN
IF p_lat IS NULL OR p_lat < -90 OR p_lat > 90 THEN RAISE EXCEPTION 'latitude out of range' USING errcode='22023'; END IF;
IF p_lng IS NULL OR p_lng < -180 OR p_lng > 180 THEN RAISE EXCEPTION 'longitude out of range' USING errcode='22023'; END IF;
IF p_radius_m IS NULL OR p_radius_m < 100 OR p_radius_m > 402336 THEN RAISE EXCEPTION 'radius must be between 100 and 402336 meters' USING errcode='22023'; END IF;
IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN RAISE EXCEPTION 'limit must be between 1 and 500' USING errcode='22023'; END IF;
IF octet_length(coalesce(p_search,'')) > 320 THEN RAISE EXCEPTION 'search is too long' USING errcode='22023'; END IF;
IF v_category NOT IN ('restroom','all') THEN RAISE EXCEPTION 'unsupported category' USING errcode='22023'; END IF;
IF v_match NOT IN ('all','any') THEN RAISE EXCEPTION 'amenity match must be all or any' USING errcode='22023'; END IF;
IF cardinality(coalesce(p_amenity_names,'{}'::text[])) > 24 THEN RAISE EXCEPTION 'too many amenities' USING errcode='22023'; END IF;
IF EXISTS (SELECT 1 FROM unnest(coalesce(p_amenity_names,'{}'::text[])) n WHERE length(trim(n)) > 80) THEN RAISE EXCEPTION 'amenity name is too long' USING errcode='22023'; END IF;
SELECT coalesce(array_agg(name ORDER BY name),'{}'::text[]) INTO v_names FROM (SELECT DISTINCT lower(trim(n)) name FROM unnest(coalesce(p_amenity_names,'{}'::text[])) n WHERE nullif(trim(n),'') IS NOT NULL) q;
RETURN QUERY WITH safe_rows AS (
 SELECT n FROM public.map_network_nearby_v2(p_lat,p_lng,p_radius_m,CASE WHEN cardinality(v_names)>0 THEN 500 ELSE p_limit END,CASE WHEN v_category='restroom' THEN 'restroom' ELSE 'all' END,p_search,'{}'::text[]) n
), selected_rows AS (
 SELECT n FROM safe_rows WHERE v_category='all' OR lower(coalesce(n->>'category',''))='restroom'
)
SELECT CASE WHEN v_category='restroom' THEN n || jsonb_build_object('category','restroom') ELSE n END
FROM selected_rows WHERE cardinality(v_names)=0 OR (v_match='any' AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(n->'amenities','[]'::jsonb)) a WHERE lower(trim(coalesce(a->>'name','')))=any(v_names))) OR (v_match='all' AND (SELECT count(DISTINCT lower(trim(coalesce(a->>'name','')))) FROM jsonb_array_elements(coalesce(n->'amenities','[]'::jsonb)) a WHERE lower(trim(coalesce(a->>'name','')))=any(v_names))=cardinality(v_names))
ORDER BY coalesce((n->>'distance_meters')::double precision,1e18);
END;$function$
;
