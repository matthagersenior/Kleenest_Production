-- Scale hot nearby-map reads by avoiding locations -> places compatibility view -> locations self lookups.
create or replace function kleenest_api_private.map_network_nearby_all_core_v1(
 p_lat double precision,p_lng double precision,p_radius_m integer default 8047,p_limit integer default 500,p_search text default null)
returns setof jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public','extensions' as $$
declare v_origin geography;
begin
 if p_lat is null or p_lat < -90 or p_lat > 90 then raise exception 'latitude out of range' using errcode='22023'; end if;
 if p_lng is null or p_lng < -180 or p_lng > 180 then raise exception 'longitude out of range' using errcode='22023'; end if;
 if p_radius_m is null or p_radius_m < 100 or p_radius_m > 402336 then raise exception 'radius must be between 100 and 402336 meters' using errcode='22023'; end if;
 if p_limit is null or p_limit < 1 or p_limit > 2000 then raise exception 'limit must be between 1 and 2000' using errcode='22023'; end if;
 if octet_length(coalesce(p_search,'')) > 320 then raise exception 'search is too long' using errcode='22023'; end if;
 v_origin:=ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::geography;
 return query with candidates as (
  select l.id location_id,coalesce(o.place_id,l.id) place_id,coalesce(l.name,'Kleenest place') name,
   case when lower(coalesce(public.map_location_category(l.place_type),l.place_type,'')) in ('library','library_dropoff') then 'government'
    when coalesce(l.source_metadata->>'brand',l.source_metadata->>'brand_name',l.source_metadata->'evidence'->>'brand') is not null and lower(coalesce(public.map_location_category(l.place_type),l.place_type,''))='service' then 'brand'
    else coalesce(nullif(public.map_location_category(l.place_type),''),nullif(l.place_type,''),'service') end category,
   l.address,l.city,l.state,l.postal_code,l.latitude,l.longitude,ST_Distance(l.geom,v_origin) distance_meters,l.source,l.source_dataset,l.source_external_id,
   (l.verification_status::text='verified') is_verified,coalesce(l.rating,0) rating,coalesce(l.review_count,0) review_count,l.cleanliness_pct,l.verification_confidence,
   l.verification_status::text verification_status,l.bathroom_verification_status,l.bathroom_verified_at,l.verification_observation_count,l.updated_at,
   coalesce(l.source_metadata->>'brand',l.source_metadata->>'brand_name',l.source_metadata->'evidence'->>'brand') brand,
   coalesce(l.source_metadata->>'operator',l.source_metadata->>'operator_name',l.source_metadata->'evidence'->>'operator') operator_name,
   coalesce(l.source_metadata->'osm_tags','{}'::jsonb) osm_tags,coalesce(l.claimed_business_id,l.business_id) business_id,
   l.place_type,l.phone,l.website,l.description,l.accessible,l.changing_table,l.smart_bathroom,l.cleaning_schedule,l.promo_offer
  from public.locations l left join public.place_compat_overrides o on o.location_id=l.id
  where l.is_active=true and l.geom is not null and ST_DWithin(l.geom,v_origin,p_radius_m)
   and (nullif(trim(p_search),'') is null or coalesce(l.name,'') ilike '%'||p_search||'%' or coalesce(l.address,'') ilike '%'||p_search||'%'
    or coalesce(l.city,'') ilike '%'||p_search||'%' or coalesce(l.state,'') ilike '%'||p_search||'%' or coalesce(l.postal_code,'') ilike '%'||p_search||'%'
    or coalesce(l.source_metadata->>'brand','') ilike '%'||p_search||'%' or coalesce(l.source_metadata->>'brand_name','') ilike '%'||p_search||'%'
    or coalesce(l.source_metadata->>'operator','') ilike '%'||p_search||'%' or coalesce(l.source_metadata->>'operator_name','') ilike '%'||p_search||'%')
  order by distance_meters limit p_limit
 ), enriched as (
  select c.*,b.name business_name,b.logo_url business_logo_url,b.business_tier::text business_tier,b.id is not null kleenest_business,
   coalesce(a.items,'[]'::jsonb) amenities,coalesce(f.items,'{}'::jsonb) fixtures
  from candidates c left join public.businesses b on b.id=c.business_id
  left join lateral (select jsonb_agg(distinct jsonb_build_object('name',aa.name,'category',aa.category)) items from public.location_amenities la join public.amenities aa on aa.id=la.amenity_id where la.location_id=c.location_id) a on true
  left join lateral (select jsonb_build_object('stalls',lf.stalls,'urinals',lf.urinals,'sinks',lf.sinks,'hand_dryers',lf.hand_dryers,'changing_tables',lf.changing_tables,'showers',lf.showers) items from public.location_fixtures lf where lf.location_id=c.location_id limit 1) f on true
 )
 select jsonb_build_object('location_id',e.location_id,'place_id',e.place_id,'name',e.name,'category',e.category,'address',e.address,'city',e.city,'state',e.state,'postal_code',e.postal_code,
 'latitude',e.latitude,'longitude',e.longitude,'distance_meters',e.distance_meters,'source',e.source,'source_dataset',e.source_dataset,'source_external_id',e.source_external_id,
 'is_verified',e.is_verified,'rating',e.rating,'review_count',e.review_count,'cleanliness_pct',e.cleanliness_pct,'verification_confidence',e.verification_confidence,
 'confidence',e.verification_confidence,'verification_status',e.verification_status,'restroom_verification_status',e.bathroom_verification_status,'last_verified_at',e.bathroom_verified_at,
 'observation_count',e.verification_observation_count,'freshness_at',e.updated_at,'amenities',e.amenities,'fixtures',e.fixtures,'brand',e.brand,'operator_name',e.operator_name,'osm_tags',e.osm_tags,
 'business_id',e.business_id,'business_name',e.business_name,'business_logo_url',e.business_logo_url,'business_tier',e.business_tier,'kleenest_business',e.kleenest_business,
 'place_type',e.place_type,'phone',e.phone,'website',e.website,'description',e.description,'accessible',e.accessible,'changing_table',e.changing_table,'smart_bathroom',e.smart_bathroom,
 'cleaning_schedule',e.cleaning_schedule,'promo_offer',e.promo_offer) from enriched e order by e.distance_meters;
end $$;