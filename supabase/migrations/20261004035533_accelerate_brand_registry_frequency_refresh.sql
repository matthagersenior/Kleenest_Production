CREATE INDEX IF NOT EXISTS locations_brand_frequency_refresh_idx
ON public.locations (public.normalize_brand_key(name))
WHERE is_active IS DISTINCT FROM false
  AND place_type IN ('restaurant','cafe','gas_station','shopping','retail','lodging','service','business','health')
  AND NULLIF(trim(name),'') IS NOT NULL;
