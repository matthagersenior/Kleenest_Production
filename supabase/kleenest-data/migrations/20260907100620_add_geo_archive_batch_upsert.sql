create or replace function public.ingest_geo_archive_rows(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  insert into public.geo_locations (
    id,name,address,city,state,postal_code,country,latitude,longitude,place_type,
    phone,website,source,source_dataset,source_external_id,source_metadata,
    source_updated_at,first_seen_at,last_seen_at,updated_at
  )
  select
    (x->>'id')::uuid,
    x->>'name', nullif(x->>'address',''), nullif(x->>'city',''), nullif(x->>'state',''),
    nullif(x->>'postal_code',''), nullif(x->>'country',''),
    (x->>'latitude')::double precision, (x->>'longitude')::double precision,
    nullif(x->>'place_type',''), nullif(x->>'phone',''), nullif(x->>'website',''),
    coalesce(nullif(x->>'source',''),'unknown'), nullif(x->>'source_dataset',''), nullif(x->>'source_external_id',''),
    coalesce(x->'source_metadata','{}'::jsonb),
    nullif(x->>'source_updated_at','')::timestamptz,
    nullif(x->>'first_seen_at','')::timestamptz,
    nullif(x->>'last_seen_at','')::timestamptz,
    coalesce(nullif(x->>'updated_at','')::timestamptz, now())
  from jsonb_array_elements(p_rows) x
  where nullif(x->>'id','') is not null
    and nullif(x->>'name','') is not null
    and nullif(x->>'latitude','') is not null
    and nullif(x->>'longitude','') is not null
  on conflict (id) do update set
    name=excluded.name,
    address=excluded.address,
    city=excluded.city,
    state=excluded.state,
    postal_code=excluded.postal_code,
    country=excluded.country,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    place_type=excluded.place_type,
    phone=excluded.phone,
    website=excluded.website,
    source=excluded.source,
    source_dataset=coalesce(excluded.source_dataset,public.geo_locations.source_dataset),
    source_external_id=coalesce(excluded.source_external_id,public.geo_locations.source_external_id),
    source_metadata=case when excluded.source_metadata <> '{}'::jsonb then excluded.source_metadata else public.geo_locations.source_metadata end,
    source_updated_at=coalesce(excluded.source_updated_at,public.geo_locations.source_updated_at),
    first_seen_at=coalesce(public.geo_locations.first_seen_at,excluded.first_seen_at),
    last_seen_at=greatest(public.geo_locations.last_seen_at,excluded.last_seen_at),
    updated_at=greatest(public.geo_locations.updated_at,excluded.updated_at);
  get diagnostics v_count = row_count;
  return jsonb_build_object('accepted',v_count);
end;
$$;
revoke all on function public.ingest_geo_archive_rows(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_geo_archive_rows(jsonb) to service_role;
