create or replace function public.ingest_osm_locations(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  item jsonb;
  ext_id text;
  rec_id uuid;
  loc_id uuid;
  lat double precision;
  lng double precision;
  nm text;
  place_type text;
  address text;
  city text;
  state text;
  postal text;
  phone text;
  website text;
  v_key text;
  imported integer := 0;
  updated integer := 0;
  observations integer := 0;
  source_meta jsonb;
  obs_value text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Trusted OSM ingestion requires server authority';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'p_rows must be an array containing at most 500 records';
  end if;

  select id into v_source_id
  from public.external_data_sources
  where source_key='osm' and active=true;
  if v_source_id is null then
    raise exception 'OSM source is not configured';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    ext_id := nullif(item->>'source_id','');
    lat := nullif(item->>'latitude','')::double precision;
    lng := nullif(item->>'longitude','')::double precision;
    if ext_id is null or lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then continue; end if;
    if ext_id !~ '^osm:(node|way|relation):[0-9]+$' then continue; end if;
    if coalesce(item->'source_metadata'->>'osm_type','') <> split_part(ext_id,':',2)
       or coalesce(item->'source_metadata'->>'osm_id','') <> split_part(ext_id,':',3) then continue; end if;

    nm := coalesce(nullif(item->>'name',''),'Public Place');
    place_type := coalesce(nullif(item->>'place_type',''),'place');
    address := nullif(item->>'address','');
    city := nullif(item->>'city','');
    state := nullif(item->>'state','');
    postal := nullif(item->>'postal_code','');
    phone := nullif(item->>'phone','');
    website := nullif(item->>'website','');
    source_meta := coalesce(item->'source_metadata','{}'::jsonb);

    select elr.location_id into loc_id
    from public.external_location_records elr
    where elr.source_id=v_source_id and elr.external_id=ext_id
    limit 1;

    if loc_id is null then
      select l.id into loc_id
      from public.locations l
      where l.latitude is not null and l.longitude is not null
        and abs(l.latitude-lat)<0.0005 and abs(l.longitude-lng)<0.0005
        and lower(coalesce(l.name,''))=lower(nm)
      limit 1;
    end if;

    if loc_id is null then
      insert into public.locations(
        name,address,city,state,postal_code,country,latitude,longitude,place_type,
        phone,website,source,source_dataset,source_external_id,source_metadata,
        bathroom_verification_source,bathroom_verification_status,is_active,created_at,updated_at
      ) values (
        nm,address,city,state,postal,'US',lat,lng,place_type,phone,website,'osm',
        'OpenStreetMap',ext_id,source_meta,'osm',
        case when item->>'osm_amenity'='toilets' then 'has_bathroom' else 'unverified' end,
        true,now(),now()
      ) returning id into loc_id;
      imported := imported + 1;
    else
      update public.locations l set
        name=coalesce(nullif(l.name,''),nm),
        address=coalesce(nullif(l.address,''),address),
        city=coalesce(nullif(l.city,''),city),
        state=coalesce(nullif(l.state,''),state),
        postal_code=coalesce(nullif(l.postal_code,''),postal),
        phone=coalesce(nullif(l.phone,''),phone),
        website=coalesce(nullif(l.website,''),website),
        latitude=coalesce(l.latitude,lat),
        longitude=coalesce(l.longitude,lng),
        source_dataset=coalesce(l.source_dataset,'OpenStreetMap'),
        source_external_id=coalesce(l.source_external_id,ext_id),
        source_metadata=coalesce(l.source_metadata,'{}'::jsonb)||source_meta,
        bathroom_verification_source=case when item->>'osm_amenity'='toilets' then 'osm' else l.bathroom_verification_source end,
        bathroom_verification_status=case when item->>'osm_amenity'='toilets' then 'has_bathroom' else l.bathroom_verification_status end,
        updated_at=now()
      where l.id=loc_id;
      updated := updated + 1;
    end if;

    insert into public.external_location_records(
      source_id,external_id,record_type,location_id,latitude,longitude,name,raw_data,last_seen_at
    ) values (
      v_source_id,ext_id,place_type,loc_id,lat,lng,nm,item,now()
    ) on conflict(source_id,external_id) do update set
      location_id=excluded.location_id,
      latitude=excluded.latitude,
      longitude=excluded.longitude,
      name=excluded.name,
      raw_data=excluded.raw_data,
      last_seen_at=now(),
      active=true
    returning id into rec_id;

    for v_key in select key from jsonb_each_text(coalesce(item->'observations','{}'::jsonb)) loop
      obs_value := (item->'observations')->>v_key;
      insert into public.external_observations(
        source_id,external_record_id,location_id,attribute_key,value_text,confidence,
        provenance,verification_state,observed_at,imported_at
      ) values (
        v_source_id,rec_id,loc_id,v_key,obs_value,0.80,
        jsonb_build_object('source','OpenStreetMap','source_id',ext_id),
        'externally_sourced',now(),now()
      ) on conflict(source_id,external_record_id,attribute_key) do update set
        value_text=excluded.value_text,
        observed_at=now(),
        imported_at=now(),
        confidence=excluded.confidence,
        verification_state='externally_sourced',
        provenance=excluded.provenance;

      perform public.apply_external_amenity_to_location(loc_id,v_key,obs_value);
      observations := observations + 1;
    end loop;

    insert into public.data_feature_events(
      subject_type,subject_id,event_type,feature_code,source_table,source_id,
      value_numeric,value_text,metadata,occurred_at
    ) values (
      'location',loc_id,'external_data_import','maps.external.osm',
      'external_location_records',rec_id,1,'OpenStreetMap',
      jsonb_build_object('external_id',ext_id,'place_type',place_type,'verification','external_source'),now()
    );
  end loop;

  return jsonb_build_object(
    'imported_locations',imported,
    'updated_locations',updated,
    'observations_upserted',observations
  );
end;
$$;
