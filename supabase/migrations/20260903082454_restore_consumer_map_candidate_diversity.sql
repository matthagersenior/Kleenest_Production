create or replace function public.map_network_nearby_v2(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 30000,
  p_limit integer default 250,
  p_category text default null,
  p_search text default null,
  p_amenity_names text[] default '{}'::text[]
)
returns setof jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select to_jsonb(n) || jsonb_build_object(
    'business_id', coalesce(l.claimed_business_id,l.business_id),
    'business_name', b.name,
    'business_logo_url', b.logo_url,
    'place_type', l.place_type,
    'phone', l.phone,
    'website', l.website,
    'description', l.description,
    'accessible', l.accessible,
    'changing_table', l.changing_table,
    'smart_bathroom', l.smart_bathroom,
    'cleaning_schedule', l.cleaning_schedule,
    'promo_offer', l.promo_offer
  )
  from public.map_network_nearby_v1(
    p_lat,
    p_lng,
    p_radius_m,
    p_limit,
    case when lower(coalesce(p_category,''))='restroom' then 'all' else p_category end,
    p_search,
    p_amenity_names
  ) n
  left join public.locations l on l.id=n.location_id
  left join public.businesses b on b.id=coalesce(l.claimed_business_id,l.business_id)
  order by n.distance_meters
$function$;
