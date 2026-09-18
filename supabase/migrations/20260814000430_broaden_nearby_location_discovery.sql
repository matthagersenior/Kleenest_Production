create or replace function public.nearby_locations(lat double precision, lng double precision, radius_meters integer default 8047, limit_count integer default 50)
returns table(id uuid,name text,business_id uuid,address text,city text,state text,latitude double precision,longitude double precision,distance_meters double precision,rating numeric,review_count integer,cleanliness_pct numeric,accessible boolean,changing_table boolean)
language sql stable set search_path to 'public','extensions' as $$
 select l.id,l.name,l.business_id,l.address,l.city,l.state,l.latitude,l.longitude,
   round((case when l.geom is not null then extensions.st_distance(l.geom,extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography) else extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(l.longitude,l.latitude),4326)::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography) end)::numeric,1),
   l.rating,l.review_count,l.cleanliness_pct,l.accessible,l.changing_table
 from public.locations l
 where l.is_active=true
   and ((l.geom is not null) or (l.latitude is not null and l.longitude is not null))
   and (case when l.geom is not null then extensions.st_dwithin(l.geom,extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography,radius_meters) else extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(l.longitude,l.latitude),4326)::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography,radius_meters) end)
 order by (case when l.geom is not null then l.geom <-> extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography else extensions.st_setsrid(extensions.st_makepoint(l.longitude,l.latitude),4326)::extensions.geography <-> extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography end)
 limit greatest(1,least(limit_count,200));
$$;
