-- Canonical restroom amenity requested for Explore filters and review evidence.
insert into public.amenities (name,category)
select 'Gender-neutral Restroom','Restroom'
where not exists (
  select 1 from public.amenities
  where lower(name) in (
    'gender-neutral restroom',
    'gender neutral restroom',
    'all-gender restroom',
    'all gender restroom',
    'unisex restroom'
  )
);
