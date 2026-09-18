create or replace function public.normalize_ingestion_place_type(p_value text)
returns text
language sql
immutable
set search_path=''
as $$
  select case lower(trim(coalesce(p_value,'')))
    when '' then 'place'
    when 'place' then 'place'
    when 'business' then 'service'
    when 'commercial' then 'service'
    when 'professional_service' then 'service'
    when 'services' then 'service'
    when 'service' then 'service'
    when 'retail' then 'shopping'
    when 'shop' then 'shopping'
    when 'store' then 'shopping'
    when 'shopping' then 'shopping'
    when 'mall' then 'shopping'
    when 'supermarket' then 'shopping'
    when 'convenience_store' then 'shopping'
    when 'restaurant' then 'restaurant'
    when 'fast_food' then 'restaurant'
    when 'food' then 'restaurant'
    when 'bar' then 'restaurant'
    when 'cafe' then 'cafe'
    when 'coffee_shop' then 'cafe'
    when 'fuel' then 'gas_station'
    when 'gas' then 'gas_station'
    when 'gas_station' then 'gas_station'
    when 'petrol_station' then 'gas_station'
    when 'toilet' then 'restroom'
    when 'toilets' then 'restroom'
    when 'bathroom' then 'restroom'
    when 'restroom' then 'restroom'
    when 'public_restroom' then 'restroom'
    when 'hospital' then 'health'
    when 'clinic' then 'health'
    when 'doctor' then 'health'
    when 'doctors' then 'health'
    when 'dentist' then 'health'
    when 'pharmacy' then 'health'
    when 'healthcare' then 'health'
    when 'health' then 'health'
    when 'park' then 'park'
    when 'nature_reserve' then 'park'
    when 'playground' then 'park'
    when 'dog_park' then 'dog_park'
    when 'library' then 'library'
    when 'library_dropoff' then 'library'
    when 'police' then 'public_safety'
    when 'fire_station' then 'public_safety'
    when 'public_safety' then 'public_safety'
    when 'hotel' then 'lodging'
    when 'motel' then 'lodging'
    when 'hostel' then 'lodging'
    when 'lodging' then 'lodging'
    when 'camp_site' then 'lodging'
    when 'caravan_site' then 'lodging'
    when 'rest_area' then 'road_service'
    when 'services_area' then 'road_service'
    when 'road_service' then 'road_service'
    when 'bus_station' then 'transit'
    when 'railway_station' then 'transit'
    when 'transit' then 'transit'
    when 'travel' then 'travel'
    else 'service'
  end
$$;

comment on function public.normalize_ingestion_place_type(text) is 'Canonical Kleenest ingestion boundary mapping. External source categories must normalize here before reaching public.locations.';

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='ingest_external_locations'
  limit 1;

  if v_def is null then raise exception 'ingest_external_locations not found'; end if;

  v_def := replace(v_def,
    ' if p_source_key not in (''osm'',''data_gov'',''refuge_restrooms'',''stlouis_open_data'',''nps'',''transit_gtfs'') then raise exception ''External source is not permitted: %'',p_source_key; end if;' || chr(10),
    '');

  v_def := replace(v_def,
    '   v_name:=coalesce(nullif(item->>''name'',''''),''Public Place'');' || chr(10) ||
    '   v_place_type:=coalesce(nullif(item->>''place_type'',''''),''place'');',
    '   v_name:=coalesce(nullif(trim(regexp_replace(item->>''name'',''\\s+'','' '',''g'')),''''),''Public Place'');' || chr(10) ||
    '   v_place_type:=public.normalize_ingestion_place_type(item->>''place_type'');');

  execute v_def;
end $$;

revoke all on function public.normalize_ingestion_place_type(text) from public;
grant execute on function public.normalize_ingestion_place_type(text) to service_role, postgres;
