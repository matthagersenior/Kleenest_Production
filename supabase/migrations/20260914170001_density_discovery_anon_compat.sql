create or replace function public.map_network_nearby_v3(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 30000,
  p_limit integer default 50,
  p_category text default 'restroom'::text,
  p_search text default null::text,
  p_amenity_names text[] default '{}'::text[],
  p_amenity_match text default 'any'::text
)
returns setof jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','public','extensions'
as $function$
declare
  v_origin geography;
  v_names text[] := '{}'::text[];
  v_match text := lower(coalesce(nullif(trim(p_amenity_match),''),'any'));
begin
  if p_lat is null or p_lat < -90 or p_lat > 90 then raise exception 'latitude out of range' using errcode='22023'; end if;
  if p_lng is null or p_lng < -180 or p_lng > 180 then raise exception 'longitude out of range' using errcode='22023'; end if;
  if p_radius_m is null or p_radius_m < 100 or p_radius_m > 402336 then raise exception 'radius must be between 100 and 402336 meters' using errcode='22023'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'limit must be between 1 and 500' using errcode='22023'; end if;
  if octet_length(coalesce(p_search,'')) > 320 then raise exception 'search is too long' using errcode='22023'; end if;
  if lower(coalesce(nullif(trim(p_category),''),'restroom')) not in ('restroom','all') then raise exception 'unsupported category' using errcode='22023'; end if;
  if v_match not in ('all','any') then raise exception 'amenity match must be all or any' using errcode='22023'; end if;
  if cardinality(coalesce(p_amenity_names,'{}'::text[])) > 24 then raise exception 'too many amenities' using errcode='22023'; end if;
  if exists (select 1 from unnest(coalesce(p_amenity_names,'{}'::text[])) n where length(trim(n)) > 80) then raise exception 'amenity name is too long' using errcode='22023'; end if;

  select coalesce(array_agg(name order by name),'{}'::text[]) into v_names
  from (
    select distinct lower(trim(n)) name
    from unnest(coalesce(p_amenity_names,'{}'::text[])) n
    where nullif(trim(n),'') is not null
  ) q;

  v_origin := st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography;

  return query
  with candidates as (
    select
      l.*,
      p.id as place_id,
      p.name as place_name,
      p.category as place_category,
      p.rating as place_rating,
      p.review_count as place_review_count,
      p.is_verified as place_verified,
      st_distance(l.geom,v_origin) as dist
    from public.locations l
    left join lateral (
      select pp.id,pp.name,pp.category,pp.rating,pp.review_count,pp.is_verified
      from public.places pp
      where pp.location_id=l.id and pp.is_active=true
      order by pp.is_verified desc nulls last,pp.id
      limit 1
    ) p on true
    where l.is_active=true
      and l.geom is not null
      and st_dwithin(l.geom,v_origin,p_radius_m)
      and (
        lower(coalesce(l.bathroom_verification_status,'')) in ('has_bathroom','verified')
        or lower(coalesce(l.place_type,'')) in ('restroom','bathroom','toilet')
        or lower(coalesce(p.category,'')) in ('restroom','bathroom','toilet')
        or lower(coalesce(l.source_metadata->'evidence'->>'amenity','')) in ('toilets','restroom','bathroom')
        or lower(coalesce(l.source_metadata->'evidence'->>'building',''))='toilets'
        or lower(coalesce(l.source_metadata->'evidence'->>'toilets','')) in ('yes','public','customers','permissive')
        or lower(coalesce(l.source_metadata->>'amenity','')) in ('toilets','restroom','bathroom')
        or lower(coalesce(l.source_metadata->>'toilets','')) in ('yes','public','customers','permissive')
        or lower(coalesce(l.source_metadata->>'restroom','')) in ('yes','public','customers','permissive')
        or lower(coalesce(l.source_metadata->>'bathroom','')) in ('yes','public','customers','permissive')
        or coalesce(l.source_metadata->'osm_tags'->>'amenity','') ilike 'toilet%'
      )
      and lower(coalesce(
        l.source_metadata->'evidence'->>'toilets:access',
        l.source_metadata->'evidence'->>'access',
        l.source_metadata->>'toilets:access',
        l.source_metadata->>'access',''
      )) not in ('private','no')
      and lower(coalesce(
        l.source_metadata->'evidence'->>'toilets',
        l.source_metadata->>'toilets',''
      )) not in ('no','none')
      and (
        nullif(trim(p_search),'') is null
        or coalesce(l.name,'') ilike '%'||trim(p_search)||'%'
        or coalesce(p.name,'') ilike '%'||trim(p_search)||'%'
        or coalesce(l.address,'') ilike '%'||trim(p_search)||'%'
        or coalesce(l.city,'') ilike '%'||trim(p_search)||'%'
        or coalesce(l.state,'') ilike '%'||trim(p_search)||'%'
        or coalesce(l.postal_code,'') ilike '%'||trim(p_search)||'%'
        or coalesce(l.source_metadata->>'brand','') ilike '%'||trim(p_search)||'%'
        or coalesce(l.source_metadata->>'brand_name','') ilike '%'||trim(p_search)||'%'
      )
      and (
        cardinality(v_names)=0
        or (
          v_match='any'
          and exists (
            select 1
            from public.location_amenities la
            join public.amenities a on a.id=la.amenity_id
            where la.location_id=l.id and lower(trim(a.name))=any(v_names)
          )
        )
        or (
          v_match='all'
          and (
            select count(distinct lower(trim(a.name)))
            from public.location_amenities la
            join public.amenities a on a.id=la.amenity_id
            where la.location_id=l.id and lower(trim(a.name))=any(v_names)
          )=cardinality(v_names)
        )
      )
    order by st_distance(l.geom,v_origin)
    limit p_limit
  )
  select jsonb_build_object(
    'location_id',c.id,'place_id',c.place_id,'name',coalesce(c.place_name,c.name),'category','restroom',
    'address',c.address,'city',c.city,'state',c.state,'postal_code',c.postal_code,'latitude',c.latitude,'longitude',c.longitude,
    'distance_meters',c.dist,'source',c.source,'source_dataset',c.source_dataset,'source_external_id',c.source_external_id,
    'is_verified',coalesce(c.place_verified,false),'rating',coalesce(c.place_rating,c.rating,0),'review_count',coalesce(c.place_review_count,c.review_count,0),
    'cleanliness_pct',c.cleanliness_pct,'verification_confidence',c.verification_confidence,
    'amenities',coalesce((select jsonb_agg(distinct jsonb_build_object('name',a.name,'category',a.category)) from public.location_amenities la join public.amenities a on a.id=la.amenity_id where la.location_id=c.id),'[]'::jsonb),
    'fixtures',coalesce((select jsonb_build_object('stalls',f.stalls,'urinals',f.urinals,'sinks',f.sinks,'hand_dryers',f.hand_dryers,'changing_tables',f.changing_tables,'showers',f.showers) from public.location_fixtures f where f.location_id=c.id limit 1),'{}'::jsonb),
    'brand',coalesce(c.source_metadata->>'brand',c.source_metadata->>'brand_name',c.source_metadata->'evidence'->>'brand'),
    'operator_name',coalesce(c.source_metadata->>'operator',c.source_metadata->>'operator_name',c.source_metadata->'evidence'->>'operator'),
    'osm_tags',coalesce(c.source_metadata->'osm_tags','{}'::jsonb),
    'business_id',coalesce(c.claimed_business_id,c.business_id),
    'business_name',null,
    'business_logo_url',null,
    'place_type',c.place_type,'phone',c.phone,'website',c.website,'description',c.description,
    'accessible',c.accessible,'changing_table',c.changing_table,'smart_bathroom',c.smart_bathroom,'cleaning_schedule',c.cleaning_schedule,'promo_offer',c.promo_offer
  )
  from candidates c
  order by c.dist;
end;
$function$;

revoke all on function public.map_network_nearby_v3(double precision,double precision,integer,integer,text,text,text[],text) from public;
grant execute on function public.map_network_nearby_v3(double precision,double precision,integer,integer,text,text,text[],text) to anon,authenticated,service_role;
