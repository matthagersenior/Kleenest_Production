
create or replace function public.map_network_nearby_strict_v1(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 30000,
  p_limit integer default 250,
  p_category text default null,
  p_search text default null,
  p_amenity_names text[] default '{}'
)
returns table(
  location_id uuid,
  place_id uuid,
  name text,
  category text,
  address text,
  city text,
  state text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  distance_meters double precision,
  source text,
  source_dataset text,
  source_external_id text,
  is_verified boolean,
  rating numeric,
  review_count integer,
  cleanliness_pct numeric,
  verification_confidence numeric,
  amenities jsonb,
  fixtures jsonb,
  brand text,
  operator_name text,
  osm_tags jsonb
)
language sql
stable
set search_path to ''
as $function$
with base as (
  select
    l.id,
    coalesce(o.place_id,l.id) as place_id,
    l.place_type,
    l.name,
    l.address,
    l.city,
    l.state,
    l.postal_code,
    l.latitude,
    l.longitude,
    l.source,
    l.source_dataset,
    l.source_external_id,
    l.source_metadata,
    l.rating as l_rating,
    l.review_count as l_review_count,
    l.cleanliness_pct,
    l.verification_confidence,
    public.map_location_category(l.place_type) as place_category,
    coalesce(l.rating,0) as p_rating,
    coalesce(l.review_count,0) as p_review_count,
    (l.verification_status::text='verified') as p_is_verified,
    l.name as place_name,
    coalesce(l.source_metadata->>'brand',l.source_metadata->>'brand_name',l.source_metadata->'evidence'->>'brand') as brand_name,
    coalesce(l.source_metadata->>'operator',l.source_metadata->>'operator_name',l.source_metadata->'evidence'->>'operator') as operator_name,
    6371000.0*2*asin(sqrt(
      power(sin(radians(l.latitude-p_lat)/2),2)
      + cos(radians(p_lat))*cos(radians(l.latitude))
      * power(sin(radians(l.longitude-p_lng)/2),2)
    )) as dist,
    (
      lower(coalesce(l.source_metadata->'evidence'->>'toilets:access',l.source_metadata->'evidence'->>'access',l.source_metadata->>'toilets:access',l.source_metadata->>'access','')) not in ('private','no')
      and lower(coalesce(l.source_metadata->'evidence'->>'toilets',l.source_metadata->>'toilets','')) not in ('no','none')
      and (
        lower(coalesce(l.bathroom_verification_status,'')) in ('has_bathroom','verified')
        or lower(coalesce(l.place_type,'')) in ('restroom','bathroom','toilet')
        or lower(coalesce(public.map_location_category(l.place_type),'')) in ('restroom','bathroom','toilet')
        or lower(coalesce(l.source_metadata->'evidence'->>'amenity','')) in ('toilets','restroom','bathroom')
        or lower(coalesce(l.source_metadata->'evidence'->>'building',''))='toilets'
        or lower(coalesce(l.source_metadata->'evidence'->>'toilets','')) in ('yes','public','customers','permissive')
        or lower(coalesce(l.source_metadata->>'amenity','')) in ('toilets','restroom','bathroom')
        or lower(coalesce(l.source_metadata->>'toilets','')) in ('yes','public','customers','permissive')
        or lower(coalesce(l.source_metadata->>'restroom','')) in ('yes','public','customers','permissive')
        or lower(coalesce(l.source_metadata->>'bathroom','')) in ('yes','public','customers','permissive')
        or coalesce(l.source_metadata->'osm_tags'->>'amenity','') ilike 'toilet%'
      )
    ) as bathroom_signal
  from public.locations l
  left join public.place_compat_overrides o on o.location_id=l.id
  where l.is_active=true
    and l.latitude is not null
    and l.longitude is not null
    and l.latitude between p_lat-(p_radius_m/111320.0) and p_lat+(p_radius_m/111320.0)
    and l.longitude between p_lng-(p_radius_m/(111320.0*greatest(cos(radians(p_lat)),0.2)))
                        and p_lng+(p_radius_m/(111320.0*greatest(cos(radians(p_lat)),0.2)))
    and (
      p_category is null
      or lower(p_category)='all'
      or lower(p_category)=lower(coalesce(public.map_location_category(l.place_type),l.place_type,''))
      or (lower(p_category)='brand' and coalesce(l.source_metadata->>'brand',l.source_metadata->>'brand_name') is not null)
      or (
        lower(p_category)='restroom'
        and lower(coalesce(l.source_metadata->'evidence'->>'toilets:access',l.source_metadata->'evidence'->>'access',l.source_metadata->>'toilets:access',l.source_metadata->>'access','')) not in ('private','no')
        and lower(coalesce(l.source_metadata->'evidence'->>'toilets',l.source_metadata->>'toilets','')) not in ('no','none')
        and (
          lower(coalesce(l.bathroom_verification_status,'')) in ('has_bathroom','verified')
          or lower(coalesce(l.place_type,'')) in ('restroom','bathroom','toilet')
          or lower(coalesce(public.map_location_category(l.place_type),'')) in ('restroom','bathroom','toilet')
          or lower(coalesce(l.source_metadata->'evidence'->>'amenity','')) in ('toilets','restroom','bathroom')
          or lower(coalesce(l.source_metadata->'evidence'->>'building',''))='toilets'
          or lower(coalesce(l.source_metadata->'evidence'->>'toilets','')) in ('yes','public','customers','permissive')
          or lower(coalesce(l.source_metadata->>'amenity','')) in ('toilets','restroom','bathroom')
          or lower(coalesce(l.source_metadata->>'toilets','')) in ('yes','public','customers','permissive')
          or lower(coalesce(l.source_metadata->>'restroom','')) in ('yes','public','customers','permissive')
          or lower(coalesce(l.source_metadata->>'bathroom','')) in ('yes','public','customers','permissive')
          or coalesce(l.source_metadata->'osm_tags'->>'amenity','') ilike 'toilet%'
        )
      )
      or (lower(p_category)='restaurant' and lower(coalesce(public.map_location_category(l.place_type),l.place_type,'')) similar to '%(restaurant|food|fast_food)%')
      or (lower(p_category)='cafe' and lower(coalesce(public.map_location_category(l.place_type),l.place_type,'')) similar to '%(cafe|coffee)%')
      or (lower(p_category)='gas_station' and lower(coalesce(public.map_location_category(l.place_type),l.place_type,'')) similar to '%(gas|fuel)%')
      or (lower(p_category)='shopping' and lower(coalesce(public.map_location_category(l.place_type),l.place_type,'')) similar to '%(shop|retail|supermarket|mall)%')
      or (
        lower(p_category)='government'
        and (
          lower(coalesce(public.map_location_category(l.place_type),l.place_type,'')) like '%government%'
          or lower(coalesce(l.place_type,'')) in ('library','library_dropoff')
          or lower(coalesce(l.name,'')) like any(array['%city hall%','%town hall%','%county office%','%courthouse%','%court house%','%municipal%','%public library%','%library district%','%post office%','%dmv%','%department of motor vehicles'])
          or lower(coalesce(l.source_metadata->>'government','')) in ('true','yes')
          or lower(coalesce(l.source_metadata->>'is_government','')) in ('true','yes')
        )
      )
      or (lower(p_category)='park' and lower(coalesce(public.map_location_category(l.place_type),l.place_type,'')) similar to '%(park|recreation)%')
      or (lower(p_category)='health' and lower(coalesce(public.map_location_category(l.place_type),l.place_type,'')) similar to '%(hospital|clinic|health|medical|pharmacy)%')
      or (lower(p_category)='public_safety' and lower(coalesce(public.map_location_category(l.place_type),l.place_type,'')) similar to '%(police|fire|emergency|public_safety|public safety)%')
      or (lower(p_category)='cooling_center' and lower(coalesce(public.map_location_category(l.place_type),l.place_type,'')) similar to '%(cooling|heat relief|warming)%')
    )
    and (
      nullif(trim(p_search),'') is null
      or coalesce(l.name,'') ilike '%'||p_search||'%'
      or coalesce(l.address,'') ilike '%'||p_search||'%'
      or coalesce(l.city,'') ilike '%'||p_search||'%'
      or coalesce(l.state,'') ilike '%'||p_search||'%'
      or coalesce(l.postal_code,'') ilike '%'||p_search||'%'
      or coalesce(l.source_metadata->>'brand','') ilike '%'||p_search||'%'
      or coalesce(l.source_metadata->>'brand_name','') ilike '%'||p_search||'%'
      or coalesce(l.source_metadata->>'operator','') ilike '%'||p_search||'%'
      or coalesce(l.source_metadata->>'operator_name','') ilike '%'||p_search||'%'
    )
    and (
      coalesce(cardinality(p_amenity_names),0)=0
      or exists (
        select 1
        from public.location_amenities la
        join public.amenities aa on aa.id=la.amenity_id
        where la.location_id=l.id and aa.name=any(p_amenity_names)
      )
    )
),
ranked as (
  select *
  from base
  where dist<=p_radius_m
  order by case when lower(coalesce(p_category,''))='restroom' then not bathroom_signal else false end, dist
  limit greatest(1,least(p_limit,500))
),
amen as (
  select la.location_id,
         jsonb_agg(distinct jsonb_build_object('name',a.name,'category',a.category)) as items
  from ranked rr
  join public.location_amenities la on la.location_id=rr.id
  join public.amenities a on a.id=la.amenity_id
  group by la.location_id
),
fx as (
  select lf.location_id,
         jsonb_build_object(
           'stalls',lf.stalls,
           'urinals',lf.urinals,
           'sinks',lf.sinks,
           'hand_dryers',lf.hand_dryers,
           'changing_tables',lf.changing_tables,
           'showers',lf.showers
         ) as items
  from ranked rr
  join public.location_fixtures lf on lf.location_id=rr.id
)
select
  r.id,
  r.place_id,
  coalesce(r.place_name,r.name),
  case
    when lower(coalesce(r.place_category,r.place_type,'')) in ('library','library_dropoff') then 'government'
    when lower(coalesce(p_category,''))='restroom' then 'restroom'
    when lower(coalesce(p_category,''))='park' then 'park'
    when lower(coalesce(p_category,''))='health' then 'health'
    when lower(coalesce(p_category,''))='public_safety' then 'public_safety'
    when lower(coalesce(p_category,''))='cooling_center' then 'cooling_center'
    when lower(coalesce(p_category,''))='government' then 'government'
    when r.brand_name is not null and lower(coalesce(r.place_category,r.place_type,''))='service' then 'brand'
    else coalesce(r.place_category,r.place_type,'service')
  end,
  r.address,
  r.city,
  r.state,
  r.postal_code,
  r.latitude,
  r.longitude,
  r.dist,
  r.source,
  r.source_dataset,
  r.source_external_id,
  coalesce(r.p_is_verified,false),
  coalesce(r.p_rating,r.l_rating,0),
  coalesce(r.p_review_count,r.l_review_count,0),
  r.cleanliness_pct,
  r.verification_confidence,
  coalesce(a.items,'[]'::jsonb),
  coalesce(f.items,'{}'::jsonb),
  r.brand_name,
  r.operator_name,
  coalesce(r.source_metadata->'osm_tags','{}'::jsonb)
from ranked r
left join amen a on a.location_id=r.id
left join fx f on f.location_id=r.id
order by r.dist;
$function$;

revoke execute on function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) from anon, authenticated;
notify pgrst, 'reload schema';
