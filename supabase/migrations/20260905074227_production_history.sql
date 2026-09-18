create or replace function public.ingest_external_locations(p_source_key text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
set statement_timeout to '90s'
as $function$
declare
 v_source_id uuid; item jsonb; ext_id text; rec_id uuid; loc_id uuid;
 v_lat double precision; v_lng double precision; v_name text; v_place_type text;
 v_address text; v_city text; v_state text; v_postal text; v_phone text; v_website text;
 v_input_meta jsonb; v_tags jsonb; v_evidence jsonb; v_source_meta jsonb; v_compare_meta jsonb;
 v_changed integer:=0;
 imported integer:=0; updated integer:=0; skipped integer:=0; row_errors jsonb:='[]'::jsonb;
begin
 if auth.uid() is null and current_user not in ('service_role','postgres') then raise exception 'Authentication required for ingestion'; end if;
 if p_source_key not in ('osm','data_gov','refuge_restrooms','stlouis_open_data','nps','transit_gtfs') then raise exception 'External source is not permitted: %',p_source_key; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'p_rows must be an array containing at most 500 records'; end if;
 select id into v_source_id from public.external_data_sources where source_key=p_source_key and active=true;
 if v_source_id is null then raise exception 'External source is not configured: %',p_source_key; end if;

 for item in select value from jsonb_array_elements(p_rows) loop
  begin
   loc_id:=null; rec_id:=null; v_changed:=0;
   ext_id:=nullif(item->>'source_id','');
   v_lat:=nullif(item->>'latitude','')::double precision;
   v_lng:=nullif(item->>'longitude','')::double precision;
   if ext_id is null or v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    skipped:=skipped+1;
    row_errors:=row_errors||jsonb_build_array(jsonb_build_object('source_id',ext_id,'code','INVALID_ROW','message','Missing or invalid source_id/coordinates'));
    continue;
   end if;

   v_name:=coalesce(nullif(item->>'name',''),'Public Place');
   v_place_type:=coalesce(nullif(item->>'place_type',''),'place');
   v_address:=nullif(item->>'address',''); v_city:=nullif(item->>'city',''); v_state:=nullif(item->>'state',''); v_postal:=nullif(item->>'postal_code','');
   v_phone:=nullif(item->>'phone',''); v_website:=nullif(item->>'website','');

   v_input_meta:=coalesce(item->'source_metadata','{}'::jsonb);
   v_tags:=coalesce(v_input_meta->'tags','{}'::jsonb);
   v_evidence:=jsonb_strip_nulls(jsonb_build_object(
     'amenity',nullif(v_tags->>'amenity',''),
     'toilets',nullif(v_tags->>'toilets',''),
     'toilets_access',nullif(v_tags->>'toilets:access',''),
     'wheelchair',nullif(v_tags->>'wheelchair',''),
     'changing_table',nullif(v_tags->>'changing_table',''),
     'access',nullif(v_tags->>'access','')
   ));
   v_source_meta:=jsonb_strip_nulls(jsonb_build_object(
     'provider',nullif(v_input_meta->>'provider',''),
     'source_dataset',nullif(v_input_meta->>'source_dataset',''),
     'catalog_dataset_id',nullif(v_input_meta->>'catalog_dataset_id',''),
     'dataset',nullif(v_input_meta->>'dataset',''),
     'publisher',nullif(v_input_meta->>'publisher',''),
     'market_key',nullif(v_input_meta->>'market_key',''),
     'captured_at',nullif(v_input_meta->>'captured_at',''),
     'evidence',case when v_evidence='{}'::jsonb then null else v_evidence end
   ));
   v_compare_meta:=v_source_meta-'captured_at';

   select elr.location_id into loc_id from public.external_location_records elr where elr.source_id=v_source_id and elr.external_id=ext_id limit 1;
   if loc_id is null and v_name !~* '^(Public Restroom|Unnamed )' then
    select l.id into loc_id from public.locations l
    where l.latitude is not null and l.longitude is not null
      and abs(l.latitude-v_lat)<0.00025 and abs(l.longitude-v_lng)<0.00025
      and lower(coalesce(l.name,''))=lower(v_name)
    limit 1;
   end if;

   if loc_id is null then
    insert into public.locations(name,address,city,state,postal_code,country,latitude,longitude,place_type,phone,website,source,source_dataset,source_external_id,source_metadata,bathroom_verification_source,bathroom_verification_status,is_active,created_at,updated_at)
    values(v_name,v_address,v_city,v_state,v_postal,'US',v_lat,v_lng,v_place_type,v_phone,v_website,p_source_key,p_source_key,ext_id,v_source_meta,
      case when v_place_type='restroom' then p_source_key else null end,
      case when v_place_type='restroom' then 'has_bathroom' else 'unverified' end,true,now(),now())
    returning id into loc_id;
    imported:=imported+1;
   else
    update public.locations l set
      name=coalesce(nullif(l.name,''),v_name),
      address=coalesce(nullif(l.address,''),v_address),
      city=coalesce(nullif(l.city,''),v_city),
      state=coalesce(nullif(l.state,''),v_state),
      postal_code=coalesce(nullif(l.postal_code,''),v_postal),
      phone=coalesce(nullif(l.phone,''),v_phone),
      website=coalesce(nullif(l.website,''),v_website),
      latitude=coalesce(l.latitude,v_lat),
      longitude=coalesce(l.longitude,v_lng),
      place_type=case when coalesce(l.place_type,'place')='place' then v_place_type else l.place_type end,
      source_dataset=coalesce(l.source_dataset,p_source_key),
      source_external_id=coalesce(l.source_external_id,ext_id),
      source_metadata=case when v_compare_meta='{}'::jsonb then coalesce(l.source_metadata,'{}'::jsonb) when (coalesce(l.source_metadata,'{}'::jsonb)-'captured_at') is distinct from v_compare_meta then v_source_meta else l.source_metadata end,
      bathroom_verification_source=case when v_place_type='restroom' then p_source_key else l.bathroom_verification_source end,
      bathroom_verification_status=case when v_place_type='restroom' then 'has_bathroom' else l.bathroom_verification_status end,
      updated_at=now()
    where l.id=loc_id and (
      l.name is distinct from coalesce(nullif(l.name,''),v_name) or
      l.address is distinct from coalesce(nullif(l.address,''),v_address) or
      l.city is distinct from coalesce(nullif(l.city,''),v_city) or
      l.state is distinct from coalesce(nullif(l.state,''),v_state) or
      l.postal_code is distinct from coalesce(nullif(l.postal_code,''),v_postal) or
      l.phone is distinct from coalesce(nullif(l.phone,''),v_phone) or
      l.website is distinct from coalesce(nullif(l.website,''),v_website) or
      l.latitude is distinct from coalesce(l.latitude,v_lat) or
      l.longitude is distinct from coalesce(l.longitude,v_lng) or
      l.place_type is distinct from (case when coalesce(l.place_type,'place')='place' then v_place_type else l.place_type end) or
      l.source_dataset is distinct from coalesce(l.source_dataset,p_source_key) or
      l.source_external_id is distinct from coalesce(l.source_external_id,ext_id) or
      (v_compare_meta<>'{}'::jsonb and (coalesce(l.source_metadata,'{}'::jsonb)-'captured_at') is distinct from v_compare_meta) or
      l.bathroom_verification_source is distinct from (case when v_place_type='restroom' then p_source_key else l.bathroom_verification_source end) or
      l.bathroom_verification_status is distinct from (case when v_place_type='restroom' then 'has_bathroom' else l.bathroom_verification_status end)
    );
    get diagnostics v_changed = row_count;
    updated:=updated+v_changed;
   end if;

   insert into public.external_location_records(source_id,external_id,record_type,location_id,latitude,longitude,name,raw_data,last_seen_at)
   values(v_source_id,ext_id,v_place_type,loc_id,v_lat,v_lng,v_name,'{}'::jsonb,now())
   on conflict(source_id,external_id) do update set
     location_id=excluded.location_id,
     latitude=excluded.latitude,
     longitude=excluded.longitude,
     name=excluded.name,
     record_type=excluded.record_type,
     raw_data='{}'::jsonb,
     last_seen_at=now(),
     active=true
   where public.external_location_records.location_id is distinct from excluded.location_id
      or public.external_location_records.latitude is distinct from excluded.latitude
      or public.external_location_records.longitude is distinct from excluded.longitude
      or public.external_location_records.name is distinct from excluded.name
      or public.external_location_records.record_type is distinct from excluded.record_type
      or public.external_location_records.active is distinct from true
      or public.external_location_records.last_seen_at is null
      or public.external_location_records.last_seen_at < now()-interval '24 hours'
   returning id into rec_id;
  exception when others then
   skipped:=skipped+1;
   row_errors:=row_errors||jsonb_build_array(jsonb_build_object('source_id',ext_id,'code',sqlstate,'message',sqlerrm));
  end;
 end loop;
 return jsonb_build_object(
   'imported_locations',imported,
   'verification_candidates',imported,
   'updated_locations',updated,
   'skipped_rows',skipped,
   'errors',row_errors
 );
end;
$function$;
