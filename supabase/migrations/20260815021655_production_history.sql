create or replace function public.get_amenities_catalog()
returns table(id uuid,name text,category text)
language sql security definer set search_path=public
as $$ select id,name,category from public.amenities order by category,name $$;
grant execute on function public.get_amenities_catalog() to authenticated;
