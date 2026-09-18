insert into public.external_ingestion_adapters(source_key,adapter_kind,endpoint_url,enabled,page_size,cursor_offset,refresh_interval_minutes,next_run_at,field_map,static_metadata)
values(
 'kcmo_business_licenses','socrata','https://data.kcmo.org/resource/pnm4-68wg.json',true,100,0,1440,now(),
 jsonb_build_object('id','id','name','dba_name','name_fallback','business_name','category','business_type','address','address','city','city','state','state','postal_code','zipcode','geometry','location'),
 jsonb_build_object('dataset','Business License Holders','provider','socrata','publisher','City of Kansas City, Missouri','market_key','focus_corridor_kansas_city','allowed_cities',jsonb_build_array('KANSAS CITY'),'bbox',jsonb_build_array(38.45,-95.15,39.65,-93.65))
)
on conflict(source_key) do update set adapter_kind=excluded.adapter_kind,endpoint_url=excluded.endpoint_url,enabled=true,page_size=excluded.page_size,refresh_interval_minutes=excluded.refresh_interval_minutes,next_run_at=now(),field_map=excluded.field_map,static_metadata=excluded.static_metadata,updated_at=now();
