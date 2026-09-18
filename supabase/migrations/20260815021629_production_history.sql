create or replace function public.business_list_amenities(p_business_id uuid, p_location_id uuid)
returns table(amenity_id uuid, name text, category text)
language sql security definer set search_path=public
as $$
  select a.id,a.name,a.category
  from public.amenities a
  join public.location_amenities la on la.amenity_id=a.id
  join public.locations l on l.id=la.location_id
  where l.business_id=p_business_id and l.id=p_location_id
  order by a.category,a.name;
$$;

create or replace function public.business_set_location_amenity(p_business_id uuid,p_location_id uuid,p_amenity_id uuid,p_action text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare ok boolean; result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and lower(bm.role::text) in ('owner','admin','business_owner')) into ok;
  if not ok and lower(coalesce((select email from auth.users where id=auth.uid()),'')) <> 'matthagersr@gmail.com' then raise exception 'Business owner/admin permission required'; end if;
  if not exists(select 1 from public.locations where id=p_location_id and business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
  if not exists(select 1 from public.amenities where id=p_amenity_id) then raise exception 'Amenity is not in the approved Kleenest amenity catalog'; end if;
  if lower(p_action)='add' then
    insert into public.location_amenities(location_id,amenity_id) values(p_location_id,p_amenity_id) on conflict do nothing;
  elsif lower(p_action) in ('remove','delete') then
    delete from public.location_amenities where location_id=p_location_id and amenity_id=p_amenity_id;
  else raise exception 'Action must be add or remove'; end if;
  select jsonb_build_object('success',true,'action',lower(p_action),'location_id',p_location_id,'amenity_id',p_amenity_id) into result;
  return result;
end;
$$;

grant execute on function public.business_list_amenities(uuid,uuid) to authenticated;
grant execute on function public.business_set_location_amenity(uuid,uuid,uuid,text) to authenticated;
