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

  return query
  with safe_rows as (
    select n
    from public.map_network_nearby_v2(
      p_lat,
      p_lng,
      p_radius_m,
      p_limit,
      'all',
      p_search,
      '{}'::text[]
    ) n
  ),
  restroom_rows as (
    select n
    from safe_rows
    where
      lower(coalesce(n->>'place_type','')) in ('restroom','bathroom','toilet')
      or lower(coalesce(n->>'category','')) in ('restroom','bathroom','toilet')
      or exists (
        select 1
        from jsonb_array_elements(coalesce(n->'amenities','[]'::jsonb)) a
        where lower(trim(coalesce(a->>'name',''))) in (
          'public restroom','restroom','bathroom','toilet','toilets'
        )
      )
  )
  select n || jsonb_build_object('category','restroom')
  from restroom_rows
  where
    cardinality(v_names)=0
    or (
      v_match='any'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(n->'amenities','[]'::jsonb)) a
        where lower(trim(coalesce(a->>'name','')))=any(v_names)
      )
    )
    or (
      v_match='all'
      and (
        select count(distinct lower(trim(coalesce(a->>'name',''))))
        from jsonb_array_elements(coalesce(n->'amenities','[]'::jsonb)) a
        where lower(trim(coalesce(a->>'name','')))=any(v_names)
      )=cardinality(v_names)
    )
  order by coalesce((n->>'distance_meters')::double precision,1e18);
end;
$function$;

revoke all on function public.map_network_nearby_v3(double precision,double precision,integer,integer,text,text,text[],text) from public;
grant execute on function public.map_network_nearby_v3(double precision,double precision,integer,integer,text,text,text[],text) to anon,authenticated,service_role;
