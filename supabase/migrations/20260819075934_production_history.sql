insert into public.place_categories(slug,name) values ('restroom','Restrooms'),('health','Health'),('public_safety','Public Safety'),('cooling_center','Cooling Centers') on conflict(slug) do update set name=excluded.name;

create or replace function public.map_location_category(p_place_type text)
returns text language sql immutable as $$
select case
  when lower(coalesce(p_place_type,'')) in ('restroom','toilets','bathroom') then 'restroom'
  when lower(coalesce(p_place_type,'')) in ('restaurant','food') then 'restaurant'
  when lower(coalesce(p_place_type,'')) in ('cafe','coffee') then 'cafe'
  when lower(coalesce(p_place_type,'')) in ('fuel','gas_station') then 'gas_station'
  when lower(coalesce(p_place_type,'')) in ('shop','shopping','retail') then 'shopping'
  when lower(coalesce(p_place_type,'')) in ('park','leisure_park') then 'park'
  when lower(coalesce(p_place_type,'')) in ('clinic','hospital','health') then 'health'
  when lower(coalesce(p_place_type,'')) in ('fire_station','police','public_safety') then 'public_safety'
  when lower(coalesce(p_place_type,'')) in ('cooling_center') then 'cooling_center'
  else 'service'
end $$;

create or replace function public.sync_location_to_place()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.places(id, location_id, name, slug, category, description, address, city, state, postal_code, latitude, longitude, rating, review_count, is_active, is_verified, created_at, updated_at)
  values(new.id,new.id,coalesce(new.name,'Unnamed place'),null,public.map_location_category(new.place_type),new.description,new.address,new.city,new.state,new.postal_code,new.latitude,new.longitude,coalesce(new.rating,0),coalesce(new.review_count,0),coalesce(new.is_active,true),coalesce(new.verification_status::text='verified',false),coalesce(new.created_at,now()),now())
  on conflict (id) do update set location_id=excluded.location_id,name=excluded.name,category=excluded.category,description=excluded.description,address=excluded.address,city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,latitude=excluded.latitude,longitude=excluded.longitude,rating=excluded.rating,review_count=excluded.review_count,is_active=excluded.is_active,is_verified=excluded.is_verified,updated_at=now();
  return new;
end;
$$;

drop trigger if exists locations_sync_places on public.locations;
create trigger locations_sync_places after insert or update of name,address,city,state,postal_code,latitude,longitude,place_type,description,rating,review_count,is_active,verification_status on public.locations for each row execute procedure public.sync_location_to_place();

insert into public.places(id,location_id,name,category,description,address,city,state,postal_code,latitude,longitude,rating,review_count,is_active,is_verified,created_at,updated_at)
select l.id,l.id,coalesce(l.name,'Unnamed place'),public.map_location_category(l.place_type),l.description,l.address,l.city,l.state,l.postal_code,l.latitude,l.longitude,coalesce(l.rating,0),coalesce(l.review_count,0),coalesce(l.is_active,true),coalesce(l.verification_status::text='verified',false),coalesce(l.created_at,now()),now() from public.locations l where l.latitude is not null and l.longitude is not null
on conflict(id) do update set location_id=excluded.location_id,name=excluded.name,category=excluded.category,description=excluded.description,address=excluded.address,city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,latitude=excluded.latitude,longitude=excluded.longitude,rating=excluded.rating,review_count=excluded.review_count,is_active=excluded.is_active,is_verified=excluded.is_verified,updated_at=now();

create or replace function public.refresh_user_leaderboard()
returns void language plpgsql security definer set search_path=public
as $$
begin
  return;
end;
$$;
