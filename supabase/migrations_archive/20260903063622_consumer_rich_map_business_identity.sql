create or replace function public.map_network_nearby_v2(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 30000,
  p_limit integer default 250,
  p_category text default null,
  p_search text default null,
  p_amenity_names text[] default '{}'
) returns setof jsonb
language sql stable security definer set search_path = '' as $$
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
  from public.map_network_nearby_v1(p_lat,p_lng,p_radius_m,p_limit,p_category,p_search,p_amenity_names) n
  left join public.locations l on l.id=n.location_id
  left join public.businesses b on b.id=coalesce(l.claimed_business_id,l.business_id)
  order by n.distance_meters;
$$;

create or replace function public.mobile_location_detail_v1(p_location_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(l) - 'owner_email' - 'created_by' || jsonb_build_object(
    'business_id', coalesce(l.claimed_business_id,l.business_id),
    'business_name', b.name,
    'business_logo_url', b.logo_url,
    'business', case when b.id is null then null else jsonb_build_object(
      'id',b.id,'name',b.name,'description',b.description,'website',b.website,
      'phone',b.phone,'logo_url',b.logo_url,'verification_status',b.verification_status
    ) end,
    'hours', coalesce((select jsonb_agg(to_jsonb(h) order by h.day_of_week) from public.location_hours h where h.location_id=l.id),'[]'::jsonb),
    'intelligence', (select to_jsonb(i) from public.location_bathroom_intelligence i where i.location_id=l.id),
    'feature_summary', (select to_jsonb(f) from public.location_feature_summary f where f.location_id=l.id),
    'promotions', coalesce((select jsonb_agg(to_jsonb(p) order by p.starts_at desc) from public.promotions p where p.location_id=l.id and p.active is true and (p.ends_at is null or p.ends_at>=now())),'[]'::jsonb),
    'photos', coalesce((select jsonb_agg(to_jsonb(ph) order by ph.is_featured desc,ph.sort_order,ph.created_at desc) from public.location_photos ph where ph.location_id=l.id),'[]'::jsonb)
  )
  from public.locations l
  left join public.businesses b on b.id=coalesce(l.claimed_business_id,l.business_id)
  where l.id=p_location_id and l.is_active is true;
$$;

revoke all on function public.map_network_nearby_v2(double precision,double precision,integer,integer,text,text,text[]) from public;
grant execute on function public.map_network_nearby_v2(double precision,double precision,integer,integer,text,text,text[]) to anon,authenticated,service_role;
revoke all on function public.mobile_location_detail_v1(uuid) from public;
grant execute on function public.mobile_location_detail_v1(uuid) to anon,authenticated,service_role;
