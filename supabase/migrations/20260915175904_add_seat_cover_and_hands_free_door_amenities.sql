insert into public.amenities(name,category)
values
  ('Toilet Seat Covers','Hygiene'),
  ('Hands-Free Door Opener','Hygiene')
on conflict(name) do update set category=excluded.category;
