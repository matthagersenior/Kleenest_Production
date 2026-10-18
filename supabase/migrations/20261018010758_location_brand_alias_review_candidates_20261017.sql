
-- Additional conservative discovery of brand aliases at the same site.
-- This is a review queue only; no location row is merged or deactivated.
WITH named AS MATERIALIZED (
 SELECT l.id,l.name,l.address,l.city,l.state,l.geom,l.source_dataset,
  round(l.latitude::numeric,4) lat4,round(l.longitude::numeric,4) lon4,
  lower(regexp_replace(coalesce(l.address,''),'[^a-z0-9]','','gi')) address_key,
  public.normalize_brand_key(coalesce(nullif(l.brand_name,''),l.name)) raw_brand
 FROM public.locations l
 WHERE l.is_active=true AND l.geom IS NOT NULL
   AND l.name !~* '^(Unnamed |Public Restroom$|Public Place$)'
), keyed AS MATERIALIZED (
 SELECT *,
  CASE
   WHEN raw_brand IN ('qt','quiktrip','quik trip') THEN 'quiktrip'
   WHEN raw_brand IN ('bp gas station','bp') THEN 'bp'
   WHEN raw_brand IN ('7 eleven','7-eleven','seven eleven') THEN '7 eleven'
   WHEN raw_brand IN ('circlek','circle k') THEN 'circle k'
   WHEN raw_brand IN ('caseys','casey''s','caseys general store') THEN 'casey''s'
   ELSE raw_brand
  END brand_key
 FROM named
 WHERE raw_brand IS NOT NULL AND length(raw_brand)>=2
), binned AS MATERIALIZED (
 SELECT *,
  lag(id) OVER site AS peer_id,
  lag(name) OVER site AS peer_name,
  lag(source_dataset) OVER site AS peer_source,
  lag(geom) OVER site AS peer_geom
 FROM keyed
 WINDOW site AS (PARTITION BY brand_key,lat4,lon4 ORDER BY id)
), address_binned AS MATERIALIZED (
 SELECT *,
  lag(id) OVER addr AS peer_id,
  lag(name) OVER addr AS peer_name,
  lag(source_dataset) OVER addr AS peer_source,
  lag(geom) OVER addr AS peer_geom
 FROM keyed
 WHERE address_key<>'' AND address~'^[[:digit:]]'
 WINDOW addr AS (PARTITION BY brand_key,address_key,upper(coalesce(city,'')),upper(coalesce(state,'')) ORDER BY id)
), pairings AS (
 SELECT id,peer_id,name,peer_name,source_dataset,peer_source,brand_key,geom,peer_geom,'same_brand_nearby_coordinate'::text rule
 FROM binned WHERE peer_id IS NOT NULL
 UNION ALL
 SELECT id,peer_id,name,peer_name,source_dataset,peer_source,brand_key,geom,peer_geom,'same_brand_address_alias'::text rule
 FROM address_binned WHERE peer_id IS NOT NULL
), distanced AS (
 SELECT *,extensions.st_distance(geom,peer_geom)::numeric metres FROM pairings
)
INSERT INTO public.location_duplicate_cases(
 first_location_id,second_location_id,rule,confidence,status,distance_m,evidence)
SELECT LEAST(id,peer_id),GREATEST(id,peer_id),rule,
 CASE WHEN metres<=15 THEN 0.910 ELSE 0.850 END,
 'pending',round(metres,1),
 jsonb_build_object('brand_key',brand_key,'name_a',name,'name_b',peer_name,
                    'source_a',source_dataset,'source_b',peer_source,'distance_m',round(metres,1))
FROM distanced
WHERE metres<=100 AND id<>peer_id AND name IS DISTINCT FROM peer_name
ON CONFLICT(first_location_id,second_location_id) DO NOTHING;
