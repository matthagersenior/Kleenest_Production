create or replace function public.enrich_location_from_osm(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.locations%rowtype; t jsonb; nm text; addr text; pt text;
begin
 select * into r from public.locations where id=p_location_id;
 if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
 t:=coalesce(r.source_metadata->'tags','{}'::jsonb);
 nm:=nullif(trim(coalesce(t->>'name',t->>'brand',t->>'operator','')),'');
 addr:=nullif(trim(concat_ws(' ',nullif(t->>'addr:housenumber',''),nullif(t->>'addr:street',''))),'');
 pt:=case when t->>'amenity' in ('fuel') or t->>'highway' in ('services','rest_area') then 'gas_station'
 when t->>'amenity' in ('restaurant','fast_food') then 'restaurant'
 when t->>'amenity'='cafe' then 'cafe'
 when t->>'amenity' in ('hospital','clinic','doctors','dentist','pharmacy') then 'health'
 when t->>'amenity'='library' then 'library'
 when t->>'amenity'='toilets' or t->>'toilets'='yes' or t->>'toilets:access'='public' then 'toilets'
 when t->>'shop' is not null then 'retail'
 when t->>'railway'='station' or t->>'amenity'='bus_station' then 'transit'
 when t->>'leisure' in ('park','nature_reserve','playground','sports_centre') then 'park'
 when t->>'tourism' in ('hotel','motel','hostel') then 'lodging'
 when t->>'office'='government' or t->>'amenity' in ('townhall','courthouse','police','fire_station') then 'public'
 else null end;
 update public.locations set
   name=coalesce(nm,name), address=coalesce(addr,address), city=coalesce(nullif(t->>'addr:city',''),city), state=coalesce(nullif(t->>'addr:state',''),state), postal_code=coalesce(nullif(t->>'addr:postcode',''),postal_code), country=coalesce(nullif(t->>'addr:country',''),country),
   place_type=coalesce(pt,place_type), phone=coalesce(nullif(t->>'phone',''),nullif(t->>'contact:phone',''),phone), website=coalesce(nullif(t->>'website',''),nullif(t->>'contact:website',''),website), description=coalesce(nullif(t->>'description',''),description), accessible=case when t->>'wheelchair'='yes' or t->>'toilets:wheelchair'='yes' then true else accessible end, changing_table=case when t->>'changing_table'='yes' or t->>'diaper'='yes' then true else changing_table end, updated_at=now()
 where id=p_location_id;
 return jsonb_build_object('success',true,'location_id',p_location_id,'name',coalesce(nm,r.name),'address',coalesce(addr,r.address),'place_type',coalesce(pt,r.place_type));
end $$;
