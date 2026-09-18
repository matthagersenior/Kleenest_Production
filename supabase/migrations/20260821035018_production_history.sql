create or replace function public.ingest_external_locations(p_source_key text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_source_id uuid; item jsonb; ext_id text; rec_id uuid; loc_id uuid; lat double precision; lng double precision; nm text; place_type text; address text; city text; state text; postal text; phone text; website text; source_meta jsonb; imported integer:=0; updated integer:=0;
begin
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'p_rows must be an array containing at most 500 records'; end if;
  select id into v_source_id from public.external_data_sources where source_key=p_source_key and active=true;
  if v_source_id is null then raise exception 'External source is not configured: %',p_source_key; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    ext_id:=nullif(item->>'source_id',''); lat:=nullif(item->>'latitude','')::double precision; lng:=nullif(item->>'longitude','')::double precision;
    if ext_id is null or lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then continue; end if;
    nm:=coalesce(nullif(item->>'name',''),'Public Place'); place_type:=coalesce(nullif(item->>'place_type',''),'place'); address:=nullif(item->>'address',''); city:=nullif(item->>'city',''); state:=nullif(item->>'state',''); postal:=nullif(item->>'postal_code',''); phone:=nullif(item->>'phone',''); website:=nullif(item->>'website',''); source_meta:=coalesce(item->'source_metadata','{}'::jsonb);
    select elr.location_id into loc_id from public.external_location_records elr where elr.source_id=v_source_id and elr.external_id=ext_id limit 1;
    if loc_id is null then select l.id into loc_id from public.locations l where l.latitude is not null and l.longitude is not null and abs(l.latitude-lat)<0.0005 and abs(l.longitude-lng)<0.0005 and lower(coalesce(l.name,''))=lower(nm) limit 1; end if;
    if loc_id is null then
      insert into public.locations(name,address,city,state,postal_code,country,latitude,longitude,place_type,phone,website,source,source_dataset,source_external_id,source_metadata,bathroom_verification_source,bathroom_verification_status,is_active,created_at,updated_at)
      values(nm,address,city,state,postal,'US',lat,lng,place_type,phone,website,p_source_key,p_source_key,ext_id,source_meta,case when place_type='restroom' then p_source_key else null end,case when place_type='restroom' then 'has_bathroom' else 'unverified' end,true,now(),now()) returning id into loc_id; imported:=imported+1;
    else
      update public.locations l set name=coalesce(nullif(l.name,''),nm),address=coalesce(nullif(l.address,''),address),city=coalesce(nullif(l.city,''),city),state=coalesce(nullif(l.state,''),state),postal_code=coalesce(nullif(l.postal_code,''),postal),phone=coalesce(nullif(l.phone,''),phone),website=coalesce(nullif(l.website,''),website),latitude=coalesce(l.latitude,lat),longitude=coalesce(l.longitude,lng),place_type=case when coalesce(l.place_type,'place')='place' then place_type else l.place_type end,source_dataset=coalesce(l.source_dataset,p_source_key),source_external_id=coalesce(l.source_external_id,ext_id),source_metadata=coalesce(l.source_metadata,'{}'::jsonb)||source_meta,bathroom_verification_source=case when place_type='restroom' then p_source_key else l.bathroom_verification_source end,bathroom_verification_status=case when place_type='restroom' then 'has_bathroom' else l.bathroom_verification_status end,updated_at=now() where l.id=loc_id; updated:=updated+1;
    end if;
    insert into public.external_location_records(source_id,external_id,record_type,location_id,latitude,longitude,name,raw_data,last_seen_at)
    values(v_source_id,ext_id,place_type,loc_id,lat,lng,nm,item,now())
    on conflict(source_id,external_id) do update set location_id=excluded.location_id,latitude=excluded.latitude,longitude=excluded.longitude,name=excluded.name,raw_data=excluded.raw_data,last_seen_at=now(),active=true
    returning id into rec_id;
    insert into public.data_feature_events(subject_type,subject_id,location_id,event_type,feature_code,source_table,source_id,value_numeric,value_text,metadata,occurred_at,created_at,event_validity,confidence,deduplication_key,rate_limit_context)
    values('location',loc_id,loc_id,'external_data_import','maps.external.'||p_source_key,'external_location_records',rec_id,1,p_source_key,jsonb_build_object('external_id',ext_id,'place_type',place_type,'verification','external_source'),now(),now(),'valid',0.75,p_source_key||':'||ext_id,'{}'::jsonb)
    on conflict do nothing;
  end loop;
  return jsonb_build_object('imported_locations',imported,'updated_locations',updated);
end; $function$;
