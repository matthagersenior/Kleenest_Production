alter function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) rename to map_network_nearby_strict_v1;

create function public.map_network_nearby_v1(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 30000,
  p_limit integer default 250,
  p_category text default null,
  p_search text default null,
  p_amenity_names text[] default '{}'::text[]
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  strict_count integer := 0;
begin
  return query
  select * from public.map_network_nearby_strict_v1(
    p_lat, p_lng, p_radius_m, p_limit, p_category, p_search, p_amenity_names
  );
  get diagnostics strict_count = row_count;

  if strict_count = 0 and lower(coalesce(p_category,'')) = 'restroom' then
    return query
    select * from public.map_network_nearby_strict_v1(
      p_lat, p_lng, p_radius_m, p_limit, 'all', p_search, p_amenity_names
    );
  end if;
end;
$$;

revoke all on function public.map_network_nearby_strict_v1(double precision,double precision,integer,integer,text,text,text[]) from public;
grant execute on function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) to anon, authenticated;
