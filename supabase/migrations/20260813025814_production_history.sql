create or replace function public.resolve_location_identity(p_name text,p_address text,p_latitude numeric default null,p_longitude numeric default null)
returns table(location_id uuid,name text,address text,business_id uuid,match_type text)
language sql security definer set search_path=public as $$
 select l.id,l.name,l.address,l.business_id,
 case when p_address is not null and l.address=p_address then 'address' else 'name' end
 from public.locations l
 where (p_address is not null and l.address=p_address)
    or (p_name is not null and lower(trim(l.name))=lower(trim(p_name)) and (p_latitude is null or l.latitude is null or abs(l.latitude-p_latitude)<0.001) and (p_longitude is null or l.longitude is null or abs(l.longitude-p_longitude)<0.001))
 order by case when p_address is not null and l.address=p_address then 0 else 1 end
 limit 1;
$$;
grant execute on function public.resolve_location_identity(text,text,numeric,numeric) to authenticated;
