
drop function public.business_create_location(uuid,text,text,text,text,numeric,numeric);

create function public.business_create_location(
  p_business_id uuid,
  p_name text,
  p_address text,
  p_city text,
  p_state text,
  p_lat numeric,
  p_lng numeric
)
returns uuid
language sql
security definer
set search_path=''
as $$
  select (public.business_create_location_canonical(
    p_business_id,p_name,p_address,p_city,p_state,null,p_lat,p_lng,null,null
  )).id;
$$;

revoke all on function public.business_create_location(uuid,text,text,text,text,numeric,numeric) from public,anon;
grant execute on function public.business_create_location(uuid,text,text,text,text,numeric,numeric) to authenticated,service_role;
