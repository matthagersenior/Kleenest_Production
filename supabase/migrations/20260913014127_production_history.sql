-- Read-only authority for resolving partner place records to canonical Kleenest locations.
-- This function never creates or mutates locations. It is callable only by service_role.

create or replace function public.platform_match_places(
  p_name text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_max_distance_m integer default 250,
  p_external_source text default null,
  p_external_id text default null,
  p_limit integer default 5
)
returns setof jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','public','extensions'
as $$
declare
  v_name text:=nullif(trim(p_name),'');
  v_address text:=nullif(trim(p_address),'');
  v_city text:=nullif(trim(p_city),'');
  v_state text:=nullif(trim(p_state),'');
  v_postal text:=nullif(trim(p_postal_code),'');
  v_external_source text:=nullif(trim(p_external_source),'');
  v_external_id text:=nullif(trim(p_external_id),'');
  v_origin geography;
begin
  if (v_external_source is null) <> (v_external_id is null) then
    raise exception 'external source and id must be supplied together' using errcode='22023';
  end if;
  if (p_lat is null) <> (p_lng is null) then
    raise exception 'latitude and longitude must be supplied together' using errcode='22023';
  end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then
    raise exception 'latitude out of range' using errcode='22023';
  end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then
    raise exception 'longitude out of range' using errcode='22023';
  end if;
  if p_max_distance_m is null or p_max_distance_m < 10 or p_max_distance_m > 5000 then
    raise exception 'max distance must be between 10 and 5000 meters' using errcode='22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'limit must be between 1 and 10' using errcode='22023';
  end if;
  if greatest(
    length(coalesce(v_name,'')),
    length(coalesce(v_address,'')),
    length(coalesce(v_city,'')),
    length(coalesce(v_state,'')),
    length(coalesce(v_postal,'')),
    length(coalesce(v_external_source,'')),
    length(coalesce(v_external_id,''))
  ) > 320 then
    raise exception 'match input is too long' using errcode='22023';
  end if;
  if v_external_id is null and v_address is null and p_lat is null then
    raise exception 'external id, address, or coordinates are required' using errcode='22023';
  end if;

  if p_lat is not null then
    v_origin:=st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography;
  end if;

  return query
  with candidates as (
    select
      l.id,
      l.name,
      l.address,
      l.city,
      l.state,
      l.postal_code,
      l.latitude,
      l.longitude,
      l.verification_status::text as verification_status,
      l.verification_confidence,
      case
        when v_external_id is not null
          and l.source_dataset=v_external_source
          and l.source_external_id=v_external_id
        then true else false
      end as exact_external,
      case
        when v_address is not null
          and regexp_replace(lower(trim(coalesce(l.address,''))),'[^a-z0-9]+','','g')
              =regexp_replace(lower(v_address),'[^a-z0-9]+','','g')
        then true else false
      end as exact_address,
      case
        when v_name is not null
          and regexp_replace(lower(trim(coalesce(l.name,''))),'[^a-z0-9]+','','g')
              =regexp_replace(lower(v_name),'[^a-z0-9]+','','g')
        then true else false
      end as exact_name,
      case when v_city is not null and lower(trim(coalesce(l.city,'')))=lower(v_city) then true else false end as city_match,
      case when v_state is not null and lower(trim(coalesce(l.state,'')))=lower(v_state) then true else false end as state_match,
      case when v_postal is not null and lower(trim(coalesce(l.postal_code,'')))=lower(v_postal) then true else false end as postal_match,
      case when v_origin is not null and l.geom is not null then st_distance(l.geom,v_origin) else null end as distance_meters
    from public.locations l
    where l.is_active=true
      and (
        (
          v_external_id is not null
          and l.source_dataset=v_external_source
          and l.source_external_id=v_external_id
        )
        or (
          v_address is not null
          and regexp_replace(lower(trim(coalesce(l.address,''))),'[^a-z0-9]+','','g')
              =regexp_replace(lower(v_address),'[^a-z0-9]+','','g')
        )
        or (
          v_origin is not null
          and l.geom is not null
          and st_dwithin(l.geom,v_origin,p_max_distance_m)
        )
      )
  )
  select jsonb_build_object(
    'location_id',c.id,
    'name',c.name,
    'address',c.address,
    'city',c.city,
    'state',c.state,
    'postal_code',c.postal_code,
    'latitude',c.latitude,
    'longitude',c.longitude,
    'verification_status',c.verification_status,
    'verification_confidence',c.verification_confidence,
    'exact_external',c.exact_external,
    'exact_address',c.exact_address,
    'exact_name',c.exact_name,
    'city_match',c.city_match,
    'state_match',c.state_match,
    'postal_match',c.postal_match,
    'distance_meters',c.distance_meters
  )
  from candidates c
  order by
    c.exact_external desc,
    c.exact_address desc,
    c.exact_name desc,
    c.postal_match desc,
    c.city_match desc,
    c.state_match desc,
    c.distance_meters asc nulls last,
    c.verification_confidence desc nulls last,
    c.id
  limit p_limit;
end
$$;

revoke all on function public.platform_match_places(text,text,text,text,text,double precision,double precision,integer,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.platform_match_places(text,text,text,text,text,double precision,double precision,integer,text,text,integer)
  to service_role;
