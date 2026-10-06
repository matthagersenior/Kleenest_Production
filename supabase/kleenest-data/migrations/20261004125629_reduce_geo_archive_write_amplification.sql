create or replace function public.ingest_geo_archive_rows(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer:=0;
begin
 insert into public.geo_locations(id,name,address,city,state,postal_code,country,latitude,longitude,place_type,phone,website,source,source_dataset,source_external_id,source_metadata,source_updated_at,first_seen_at,last_seen_at,updated_at)
 select (x->>'id')::uuid,x->>'name',nullif(x->>'address',''),nullif(x->>'city',''),nullif(x->>'state',''),nullif(x->>'postal_code',''),nullif(x->>'country',''),(x->>'latitude')::double precision,(x->>'longitude')::double precision,nullif(x->>'place_type',''),nullif(x->>'phone',''),nullif(x->>'website',''),coalesce(nullif(x->>'source',''),'unknown'),nullif(x->>'source_dataset',''),nullif(x->>'source_external_id',''),coalesce(x->'source_metadata','{}'::jsonb),nullif(x->>'source_updated_at','')::timestamptz,nullif(x->>'first_seen_at','')::timestamptz,nullif(x->>'last_seen_at','')::timestamptz,coalesce(nullif(x->>'updated_at','')::timestamptz,now())
 from jsonb_array_elements(p_rows) x
 where nullif(x->>'id','') is not null and nullif(x->>'name','') is not null and nullif(x->>'latitude','') is not null and nullif(x->>'longitude','') is not null
 on conflict(id) do update set
 name=excluded.name,address=excluded.address,city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,country=excluded.country,latitude=excluded.latitude,longitude=excluded.longitude,place_type=excluded.place_type,phone=excluded.phone,website=excluded.website,source=excluded.source,
 source_dataset=coalesce(excluded.source_dataset,public.geo_locations.source_dataset),source_external_id=coalesce(excluded.source_external_id,public.geo_locations.source_external_id),
 source_metadata=case when excluded.source_metadata<>'{}'::jsonb then excluded.source_metadata else public.geo_locations.source_metadata end,
 source_updated_at=coalesce(excluded.source_updated_at,public.geo_locations.source_updated_at),first_seen_at=coalesce(public.geo_locations.first_seen_at,excluded.first_seen_at),
 last_seen_at=greatest(public.geo_locations.last_seen_at,excluded.last_seen_at),updated_at=greatest(public.geo_locations.updated_at,excluded.updated_at)
 where (public.geo_locations.name,public.geo_locations.address,public.geo_locations.city,public.geo_locations.state,public.geo_locations.postal_code,public.geo_locations.country,public.geo_locations.latitude,public.geo_locations.longitude,public.geo_locations.place_type,public.geo_locations.phone,public.geo_locations.website,public.geo_locations.source,
 coalesce(public.geo_locations.source_dataset,''),coalesce(public.geo_locations.source_external_id,''),public.geo_locations.source_metadata,public.geo_locations.source_updated_at,public.geo_locations.last_seen_at,public.geo_locations.updated_at)
 is distinct from
 (excluded.name,excluded.address,excluded.city,excluded.state,excluded.postal_code,excluded.country,excluded.latitude,excluded.longitude,excluded.place_type,excluded.phone,excluded.website,excluded.source,
 coalesce(excluded.source_dataset,public.geo_locations.source_dataset,''),coalesce(excluded.source_external_id,public.geo_locations.source_external_id,''),case when excluded.source_metadata<>'{}'::jsonb then excluded.source_metadata else public.geo_locations.source_metadata end,coalesce(excluded.source_updated_at,public.geo_locations.source_updated_at),greatest(public.geo_locations.last_seen_at,excluded.last_seen_at),greatest(public.geo_locations.updated_at,excluded.updated_at));
 get diagnostics v_count=row_count; return jsonb_build_object('accepted',v_count);
end $$;

select cron.unschedule('kleenest-data-geo-archive-worker');
select cron.schedule('kleenest-data-geo-archive-worker','11-59/15 * * * *',$job$
select net.http_post(
 url := 'https://sxgymblzmwdqnaidbbuq.supabase.co/functions/v1/archive-object-backfill',
 headers := jsonb_build_object('Content-Type','application/json','x-kleenest-geo-archive', public.get_internal_geo_archive_secret()),
 body := jsonb_build_object('kind','geo_locations','batches',1,'limit',500,'after_id',(select last_row_id from archive.object_manifests where kind='geo_locations' and object_path like 'geo_locations/backfill/%' order by created_at desc limit 1)),
 timeout_milliseconds := 120000);
$job$);
