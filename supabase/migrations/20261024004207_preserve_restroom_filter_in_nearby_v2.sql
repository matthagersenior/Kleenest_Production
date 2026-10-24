-- Preserve restroom filtering through v2; do not silently widen the query to all places.
CREATE OR REPLACE FUNCTION public.map_network_nearby_v2(p_lat double precision, p_lng double precision, p_radius_m integer DEFAULT 30000, p_limit integer DEFAULT 250, p_category text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_amenity_names text[] DEFAULT '{}'::text[])
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_radius integer:=least(greatest(coalesce(p_radius_m,30000),100),402336);
  v_limit integer:=least(greatest(coalesce(p_limit,250),1),500);
  v_category text:=nullif(left(trim(coalesce(p_category,'')),50),'');
  v_search text:=nullif(left(trim(coalesce(p_search,'')),200),'');
  v_amenities text[];
begin
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180 then
    raise exception 'Valid latitude and longitude are required';
  end if;

  select coalesce(array_agg(x.name order by x.name),'{}'::text[])
    into v_amenities
  from (
    select distinct left(trim(a),100) name
    from unnest(coalesce(p_amenity_names,'{}'::text[])) a
    where nullif(trim(a),'') is not null
    limit 50
  ) x;

  return query
  select to_jsonb(n) || jsonb_build_object(
    'business_id',coalesce(l.claimed_business_id,l.business_id),
    'business_name',b.name,
    'business_logo_url',b.logo_url,
    'business_tier',b.business_tier::text,
    'kleenest_business',b.id is not null,
    'place_type',l.place_type,
    'phone',l.phone,
    'website',l.website,
    'description',l.description,
    'accessible',l.accessible,
    'changing_table',l.changing_table,
    'smart_bathroom',l.smart_bathroom,
    'cleaning_schedule',l.cleaning_schedule,
    'promo_offer',l.promo_offer
  )
  from public.map_network_nearby_v1(
    p_lat,p_lng,v_radius,v_limit,
    v_category,
    v_search,v_amenities
  ) n
  left join public.locations l on l.id=n.location_id
  left join public.businesses b on b.id=coalesce(l.claimed_business_id,l.business_id)
  order by n.distance_meters;
end;
$function$
;
