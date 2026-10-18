
-- Kleenest canonical location deduplication, reversible source-ID consolidation.
CREATE TABLE IF NOT EXISTS internal.location_identity_redirects (
 duplicate_location_id uuid PRIMARY KEY REFERENCES public.locations(id) ON DELETE RESTRICT,
 canonical_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
 reason text NOT NULL,
 source_external_id text,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT location_identity_redirect_distinct CHECK (duplicate_location_id <> canonical_location_id)
);
REVOKE ALL ON internal.location_identity_redirects FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.location_duplicate_cases (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 first_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
 second_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
 rule text NOT NULL,
 confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','different_businesses','co_located','needs_geocoding','resolved')),
 distance_m numeric,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 review_notes text,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT location_duplicate_cases_ordered CHECK (first_location_id < second_location_id),
 CONSTRAINT location_duplicate_cases_unique_pair UNIQUE(first_location_id,second_location_id)
);
CREATE INDEX IF NOT EXISTS location_duplicate_cases_status_score_idx ON public.location_duplicate_cases(status,confidence DESC,created_at);
ALTER TABLE public.location_duplicate_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.location_duplicate_cases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.location_duplicate_cases TO authenticated;
GRANT UPDATE (status,review_notes,reviewed_at) ON public.location_duplicate_cases TO authenticated;
CREATE POLICY location_duplicate_cases_owner_select ON public.location_duplicate_cases FOR SELECT TO authenticated USING ((select public.is_platform_owner_session()));
CREATE POLICY location_duplicate_cases_owner_update ON public.location_duplicate_cases FOR UPDATE TO authenticated USING ((select public.is_platform_owner_session())) WITH CHECK ((select public.is_platform_owner_session()));

-- Same OSM source entity was stored as two canonical rows because of legacy source-dataset spelling.
WITH pairs AS MATERIALIZED (
 SELECT old.id duplicate_id,canonical.id canonical_id,old.source_external_id,
        old.name old_name,canonical.name new_name,old.latitude old_lat,old.longitude old_lon
 FROM public.locations old
 JOIN public.locations canonical
   ON canonical.source_dataset='osm'
  AND canonical.source_external_id=old.source_external_id
 WHERE old.source_dataset='OpenStreetMap'
   AND old.source_external_id LIKE 'osm:%'
   AND old.name IS NOT DISTINCT FROM canonical.name
   AND old.latitude IS NOT DISTINCT FROM canonical.latitude
   AND old.longitude IS NOT DISTINCT FROM canonical.longitude
)
INSERT INTO internal.location_identity_redirects
(duplicate_location_id,canonical_location_id,reason,source_external_id,evidence)
SELECT duplicate_id,canonical_id,'same_osm_object_same_coordinates',source_external_id,
       jsonb_build_object('legacy_name',old_name,'canonical_name',new_name,'latitude',old_lat,'longitude',old_lon)
FROM pairs
ON CONFLICT (duplicate_location_id) DO NOTHING;

-- Confidence is keyed by location_id: transfer only when canonical row has no confidence record.
UPDATE public.location_confidence c
SET location_id = r.canonical_location_id
FROM internal.location_identity_redirects r
WHERE c.location_id=r.duplicate_location_id
 AND r.reason='same_osm_object_same_coordinates'
 AND NOT EXISTS (SELECT 1 FROM public.location_confidence existing WHERE existing.location_id=r.canonical_location_id);

-- Preserve location rows and original IDs for rollback, historic joins and deep links.
UPDATE public.locations l
SET is_active=false
FROM internal.location_identity_redirects r
WHERE l.id=r.duplicate_location_id AND l.is_active IS DISTINCT FROM false
 AND r.reason='same_osm_object_same_coordinates';

INSERT INTO public.location_duplicate_cases
(first_location_id,second_location_id,rule,confidence,status,distance_m,evidence)
SELECT LEAST(r.duplicate_location_id,r.canonical_location_id),
       GREATEST(r.duplicate_location_id,r.canonical_location_id),
       'same_osm_source_object',1.000,'confirmed',0,
       jsonb_build_object('canonical_location_id',r.canonical_location_id,'source_external_id',r.source_external_id)
FROM internal.location_identity_redirects r
WHERE r.reason='same_osm_object_same_coordinates'
ON CONFLICT (first_location_id,second_location_id) DO NOTHING;

-- Same real address/name candidates; do not mistake a broad city name for a street address.
WITH keyed AS MATERIALIZED (
 SELECT l.id,l.name,l.address,l.city,l.state,l.source_dataset,l.geom,
        lower(regexp_replace(l.name,'[^a-z0-9]','','gi')) name_key,
        lower(regexp_replace(l.address,'[^a-z0-9]','','gi')) address_key
 FROM public.locations l
 WHERE l.is_active=true AND l.geom IS NOT NULL
   AND l.address ~ '[0-9]' AND l.name !~* '^(Unnamed |Public Restroom$|Public Place$)'
), ranked AS MATERIALIZED (
 SELECT k.*,
   lag(id) OVER w other_id,lag(name) OVER w other_name,
   lag(source_dataset) OVER w other_source, lag(geom) OVER w other_geom
 FROM keyed k
 WINDOW w AS (PARTITION BY name_key,address_key,upper(coalesce(city,'')),upper(coalesce(state,'')) ORDER BY id)
), candidates AS (
 SELECT *,
   extensions.st_distance(geom,other_geom)::numeric distance_m
 FROM ranked WHERE other_id IS NOT NULL
)
INSERT INTO public.location_duplicate_cases
(first_location_id,second_location_id,rule,confidence,status,distance_m,evidence)
SELECT LEAST(id,other_id),GREATEST(id,other_id),
       CASE WHEN distance_m<=100 THEN 'same_name_address_nearby' ELSE 'same_name_address_geocode_conflict' END,
       CASE WHEN distance_m<=20 THEN 0.970 WHEN distance_m<=100 THEN 0.900 ELSE 0.540 END,
       CASE WHEN distance_m<=100 THEN 'pending' ELSE 'needs_geocoding' END,
       round(distance_m,1),
       jsonb_build_object('name',name,'address',address,'source_a',source_dataset,'source_b',other_source,
                          'distance_m',round(distance_m,1))
FROM candidates
ON CONFLICT (first_location_id,second_location_id) DO NOTHING;

-- Harden the canonical resolver: no address-only consolidation of different tenants.
CREATE OR REPLACE FUNCTION public.resolve_location_external_identity_v2(
 p_source_dataset text, p_source_external_id text,
 p_latitude double precision, p_longitude double precision,
 p_name text DEFAULT NULL, p_brand text DEFAULT NULL,
 p_operator text DEFAULT NULL, p_address text DEFAULT NULL,
 p_city text DEFAULT NULL,p_state text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $resolver$
DECLARE
 v_id uuid;
 v_name_key text := public.normalize_brand_key(p_name);
 v_brand_key text := public.normalize_brand_key(p_brand);
 v_point extensions.geography;
BEGIN
 IF p_source_dataset IS NOT NULL AND p_source_external_id IS NOT NULL THEN
  SELECT l.id INTO v_id FROM public.locations l
   WHERE l.source_dataset=p_source_dataset AND l.source_external_id=p_source_external_id LIMIT 1;
  IF v_id IS NULL AND p_source_dataset IN ('osm','OpenStreetMap') THEN
   SELECT l.id INTO v_id FROM public.locations l
    WHERE l.source_dataset IN ('osm','OpenStreetMap') AND l.source_external_id=p_source_external_id
    ORDER BY CASE WHEN l.source_dataset='osm' THEN 0 ELSE 1 END LIMIT 1;
  END IF;
  IF v_id IS NOT NULL THEN
   RETURN coalesce((SELECT r.canonical_location_id FROM internal.location_identity_redirects r
                    WHERE r.duplicate_location_id=v_id),v_id);
  END IF;
  SELECT elr.location_id INTO v_id
   FROM public.external_location_records elr JOIN public.external_data_sources eds ON eds.id=elr.source_id
   WHERE eds.source_key=p_source_dataset AND elr.external_id=p_source_external_id AND elr.location_id IS NOT NULL LIMIT 1;
  IF v_id IS NOT NULL THEN
   RETURN coalesce((SELECT r.canonical_location_id FROM internal.location_identity_redirects r
                   WHERE r.duplicate_location_id=v_id),v_id);
  END IF;
  IF p_source_dataset='overture' AND p_source_external_id LIKE 'overture:%' THEN
   SELECT elr.location_id INTO v_id
    FROM public.external_location_records elr JOIN public.external_data_sources eds ON eds.id=elr.source_id
    WHERE eds.source_key='overture_places' AND elr.external_id=substr(p_source_external_id,length('overture:')+1)
      AND elr.location_id IS NOT NULL LIMIT 1;
   IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
 END IF;
 IF p_latitude IS NULL OR p_longitude IS NULL THEN RETURN NULL; END IF;
 -- Generic amenity names cannot uniquely identify separate entrances/fixtures.
 IF v_name_key IS NULL OR v_name_key IN ('public restroom','public place','unnamed place',
       'unnamed service','unnamed shopping','unnamed gas station','unnamed park','unnamed restaurant')
 THEN RETURN NULL; END IF;
 v_point:=extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326)::extensions.geography;
 SELECT l.id INTO v_id FROM public.locations l
 LEFT JOIN public.location_brand_identities bi ON bi.location_id=l.id
 WHERE l.is_active=true AND l.geom IS NOT NULL
   AND extensions.st_dwithin(l.geom,v_point,80.0)
   AND (
     (v_name_key IS NOT NULL AND public.normalize_brand_key(l.name)=v_name_key)
     OR (v_brand_key IS NOT NULL AND public.normalize_brand_key(coalesce(bi.canonical_brand,l.brand_name))=v_brand_key
         AND public.normalize_brand_key(l.name)=v_name_key)
   )
 ORDER BY extensions.st_distance(l.geom,v_point),l.id LIMIT 1;
 RETURN v_id;
END;
$resolver$;

-- Never re-export dormant records on the next incremental map mirror cycle.
DO $patch$
DECLARE v_definition text;
BEGIN
 SELECT pg_get_functiondef('public.geo_catalog_export_batch(integer)'::regprocedure) INTO v_definition;
 IF v_definition IS NULL OR strpos(v_definition,'where l.latitude is not null')=0 THEN
   RAISE EXCEPTION 'Geo exporter shape changed; refusing unsafe rewrite';
 END IF;
 v_definition:=replace(v_definition,'where l.latitude is not null',
                         'where l.is_active=true AND l.latitude is not null');
 EXECUTE v_definition;
END;
$patch$;
