
create or replace function public.project_external_restroom_verification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.location_id is not null
     and lower(coalesce(new.record_type, '')) = 'restroom'
     and coalesce(new.active, true) then
    update public.locations
       set bathroom_verification_status = 'has_bathroom',
           bathroom_verification_source = coalesce(nullif(bathroom_verification_source, ''), 'external_record'),
           bathroom_verified_at = coalesce(bathroom_verified_at, now()),
           updated_at = now()
     where id = new.location_id
       and coalesce(bathroom_verification_status, 'unverified') = 'unverified';
  end if;
  return new;
end;
$function$;

revoke execute on function public.project_external_restroom_verification() from public, anon, authenticated;

drop trigger if exists project_external_restroom_verification_trigger
  on public.external_location_records;

create trigger project_external_restroom_verification_trigger
after insert or update of location_id, record_type, active
on public.external_location_records
for each row
execute function public.project_external_restroom_verification();

update public.locations l
set bathroom_verification_status = 'has_bathroom',
    bathroom_verification_source = coalesce(nullif(l.bathroom_verification_source, ''), 'external_record'),
    bathroom_verified_at = coalesce(l.bathroom_verified_at, now()),
    updated_at = now()
where coalesce(l.bathroom_verification_status, 'unverified') = 'unverified'
  and exists (
    select 1
    from public.external_location_records e
    where e.location_id = l.id
      and lower(coalesce(e.record_type, '')) = 'restroom'
      and coalesce(e.active, true)
  );

create or replace function public.apply_external_amenity_to_location(
  p_location_id uuid,
  p_attribute_key text,
  p_value_text text
)
returns void
language plpgsql
security definer
set search_path = 'public', 'auth', 'extensions', 'pg_temp'
as $function$
declare
  aid uuid;
  v text := lower(coalesce(p_value_text,''));
  k text := lower(coalesce(p_attribute_key,''));
  target_name text;
begin
  if v not in ('yes','true','present','available','limited','24/7','toilets') then return; end if;
  target_name := case k
    when 'changing_table' then 'Changing Table'
    when 'changing_table_present' then 'Changing Table'
    when 'toilets:wheelchair' then 'Accessible Stall'
    when 'wheelchair' then 'Accessible'
    when 'handwashing:soap' then 'Soap'
    when 'toilets:hands_drying' then 'Hand Dryer'
    when 'hot_water' then 'Hot Water'
    when 'toilets:paper_supplied' then 'Paper Towels'
    when 'drinking_water' then 'Drinking Water'
    when 'shower' then 'Showers'
    when 'toilets:menstrual_products' then 'Baby Changing'
    when 'unisex' then 'Family Restroom'
    when 'gender_neutral' then 'Family Restroom'
    when 'opening_hours' then '24 Hours'
    when 'handwashing:hand_disinfection' then 'Touchless Fixtures'
    when 'mirror' then 'Mirrors'
    when 'parking' then 'Parking'
    when 'internet_access' then 'Free Wi-Fi'
    when 'vending' then 'Vending'
    when 'outdoor_seating' then 'Outdoor Seating'
    when 'pet' then 'Pet Friendly'
    when 'ev_charging' then 'EV Charging'
    else null
  end;
  if target_name is not null then
    select id into aid from public.amenities where lower(name)=lower(target_name) limit 1;
    if aid is not null then
      insert into public.location_amenities(location_id,amenity_id)
      values(p_location_id,aid) on conflict do nothing;
    end if;
  end if;
  if k in ('osm.amenity','amenity','toilets') and v in ('toilets','yes','true') then
    update public.locations
       set bathroom_verification_status = case
             when coalesce(bathroom_verification_status,'unverified')='unverified'
             then 'has_bathroom' else bathroom_verification_status end,
           bathroom_verification_source = coalesce(nullif(bathroom_verification_source,''),'osm'),
           bathroom_verified_at = coalesce(bathroom_verified_at,now()),
           updated_at = now()
     where id=p_location_id;
  end if;
end;
$function$;
