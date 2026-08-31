-- Remove only exact duplicate indexes on Production hot paths.
-- Keep reviews_location_created_idx for (location_id, created_at desc).
drop index if exists public.reviews_location_idx;

-- Keep locations_active_lat_lng_idx for active latitude/longitude lookups.
drop index if exists public.idx_locations_geo_lookup;

-- Keep qr_codes_business_id_idx for business-scoped QR lookup.
drop index if exists public.qr_codes_business_idx;

-- Keep route_stops_route_id_stop_order_key because it backs the UNIQUE constraint.
drop index if exists public.route_stops_route_order_unique;
