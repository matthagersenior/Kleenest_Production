create or replace function public.nearby_restrooms(lat double precision, lng double precision, radius_meters integer default 25000, limit_count integer default 200)
returns table(id uuid,name text,business_id uuid,address text,city text,state text,latitude double precision,longitude double precision,distance_meters double precision,rating numeric,review_count integer,cleanliness_pct numeric,accessible boolean,changing_table boolean,place_type text)
language sql stable security definer set search_path=public,extensions
as $$
 select l.id,l.name,l.business_id,l.address,l.city,l.state,l.latitude,l.longitude,
   round(extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(l.longitude,l.latitude),4326)::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography)::numeric,1),
   l.rating,l.review_count,l.cleanliness_pct,l.accessible,l.changing_table,l.place_type
 from public.locations l
 where l.is_active=true and l.place_type='restroom' and l.latitude is not null and l.longitude is not null
   and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(l.longitude,l.latitude),4326)::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::geography,greatest(100,radius_meters))
 order by extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(l.longitude,l.latitude),4326)::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography)
 limit greatest(1,least(limit_count,500));
$$;
revoke all on function public.nearby_restrooms(double precision,double precision,integer,integer) from public;
grant execute on function public.nearby_restrooms(double precision,double precision,integer,integer) to anon,authenticated;
