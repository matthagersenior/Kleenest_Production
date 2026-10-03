-- Reduce repeat-write amplification during rediscovery and background hydration.
-- Canonical locations already avoid no-op updates; this extends the same principle
-- to brand sidecars and external provenance rows so unchanged observations do not
-- generate WAL/index churn on every ingestion cycle. A 24-hour provenance heartbeat is retained.

CREATE OR REPLACE FUNCTION public.ingest_external_locations(p_source_key text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '90s'
AS $function$
declare
 v_source_id uuid; item jsonb; ext_id text; rec_id uuid; loc_id uuid;
 v_lat double precision; v_lng double precision; v_name text; v_place_type text;
 v_address text; v_city text; v_state text; v_postal text; v_phone text; v_website text;
 v_brand text; v_operator text; v_brand_identity jsonb;
 v_input_meta jsonb; v_tags jsonb; v_evidence jsonb; v_source_meta jsonb; v_compare_meta jsonb;
 v_changed integer:=0;
 imported integer:=0; updated integer:=0; skipped integer:=0; queued_repairs integer:=0;
 row_errors jsonb:='[]'::jsonb;
begin
 if auth.uid() is null and current_user not in ('service_role','postgres') then raise exception 'Authentication required for ingestion'; end if;
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
    row_errors:=row_errors||jsonb_build_array(jsonb_build_object('source_id',ext_id,'code','INVALID_ROW'));
    continue;
   end if;

   v_name:=coalesce(nullif(trim(regexp_replace(item->>'name','\\s+',' ','g')),''),'Public Place');
   v_place_type:=public.normalize_ingestion_place_type_for_source(p_source_key,item->>'place_type');
   v_address:=nullif(item->>'address',''); v_city:=nullif(item->>'city',''); v_state:=nullif(item->>'state',''); v_postal:=nullif(item->>'postal_code','');
   v_phone:=nullif(item->>'phone',''); v_website:=nullif(item->>'website','');

   v_input_meta:=coalesce(item->'source_metadata','{}'::jsonb);
   v_tags:=coalesce(v_input_meta->'tags','{}'::jsonb);
   v_operator:=coalesce(nullif(trim(item->>'operator_name'),''),nullif(trim(v_tags->>'operator'),''));
   v_brand_identity:=public.resolve_location_brand_identity(
     coalesce(nullif(item->>'brand',''),nullif(v_tags->>'brand','')),
     v_name,
     v_operator
   );
   v_brand:=nullif(v_brand_identity->>'canonical_brand','');

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
     'brand',v_brand,
     'brand_identity_source',nullif(v_brand_identity->>'source',''),
     'brand_identity_confidence',nullif(v_brand_identity->>'confidence',''),
     'operator',v_operator,
     'market_key',nullif(v_input_meta->>'market_key',''),
     'source_category',coalesce(nullif(v_input_meta->>'source_category',''),nullif(item->>'place_type','')),
     'source_confidence',nullif(v_input_meta->>'source_confidence',''),
     'captured_at',nullif(v_input_meta->>'captured_at',''),
     'evidence',case when v_evidence='{}'::jsonb then null else v_evidence end
   ));
   v_compare_meta:=v_source_meta-'captured_at';

   select elr.location_id into loc_id
   from public.external_location_records elr
   where elr.source_id=v_source_id and elr.external_id=ext_id
   limit 1;

   if loc_id is null then
     loc_id:=public.resolve_location_external_identity_v2(
       p_source_key,ext_id,v_lat,v_lng,v_name,v_brand,v_operator,v_address,v_city,v_state
     );
   end if;

   if loc_id is null then
    insert into public.locations(
      name,address,city,state,postal_code,country,latitude,longitude,place_type,phone,website,
      brand_name,operator_name,source,source_dataset,source_external_id,source_metadata,
      bathroom_verification_source,bathroom_verification_status,is_active,created_at,updated_at
    )
    values(
      v_name,v_address,v_city,v_state,v_postal,'US',v_lat,v_lng,v_place_type,v_phone,v_website,
      v_brand,v_operator,p_source_key,p_source_key,ext_id,v_source_meta,
      case when v_place_type='restroom' then p_source_key else null end,
      case when v_place_type='restroom' then 'has_bathroom' else 'unverified' end,true,now(),now()
    )
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
      brand_name=coalesce(v_brand,nullif(l.brand_name,'')),
      operator_name=coalesce(v_operator,nullif(l.operator_name,'')),
      latitude=coalesce(l.latitude,v_lat),
      longitude=coalesce(l.longitude,v_lng),
      place_type=case when coalesce(l.place_type,'place')='place' then v_place_type else l.place_type end,
      source_dataset=coalesce(l.source_dataset,p_source_key),
      source_external_id=coalesce(l.source_external_id,ext_id),
      source_metadata=case when v_compare_meta='{}'::jsonb then coalesce(l.source_metadata,'{}'::jsonb) when (coalesce(l.source_metadata,'{}'::jsonb)-'captured_at') is distinct from v_compare_meta then v_source_meta else l.source_metadata end,
      bathroom_verification_source=case when v_place_type='restroom' then p_source_key else l.bathroom_verification_source end,
      bathroom_verification_status=case when v_place_type='restroom' then 'has_bathroom' else l.bathroom_verification_status end,
      updated_at=now()
    where l.id=loc_id
      and row(
        l.name,l.address,l.city,l.state,l.postal_code,l.phone,l.website,
        l.brand_name,l.operator_name,l.latitude,l.longitude,l.place_type,
        l.source_dataset,l.source_external_id,l.source_metadata,
        l.bathroom_verification_source,l.bathroom_verification_status
      ) is distinct from row(
        coalesce(nullif(l.name,''),v_name),
        coalesce(nullif(l.address,''),v_address),
        coalesce(nullif(l.city,''),v_city),
        coalesce(nullif(l.state,''),v_state),
        coalesce(nullif(l.postal_code,''),v_postal),
        coalesce(nullif(l.phone,''),v_phone),
        coalesce(nullif(l.website,''),v_website),
        coalesce(v_brand,nullif(l.brand_name,'')),
        coalesce(v_operator,nullif(l.operator_name,'')),
        coalesce(l.latitude,v_lat),
        coalesce(l.longitude,v_lng),
        case when coalesce(l.place_type,'place')='place' then v_place_type else l.place_type end,
        coalesce(l.source_dataset,p_source_key),
        coalesce(l.source_external_id,ext_id),
        case
          when v_compare_meta='{}'::jsonb then coalesce(l.source_metadata,'{}'::jsonb)
          when (coalesce(l.source_metadata,'{}'::jsonb)-'captured_at') is distinct from v_compare_meta then v_source_meta
          else l.source_metadata
        end,
        case when v_place_type='restroom' then p_source_key else l.bathroom_verification_source end,
        case when v_place_type='restroom' then 'has_bathroom' else l.bathroom_verification_status end
      );
    get diagnostics v_changed=row_count;
    updated:=updated+v_changed;
   end if;

   if v_brand is not null then
     insert into public.location_brand_identities(location_id,canonical_brand,source,confidence,alias_key,detected_at,updated_at)
     values(
       loc_id,
       v_brand,
       coalesce(nullif(v_brand_identity->>'source',''),'ingestion'),
       coalesce(nullif(v_brand_identity->>'confidence','')::numeric,.900),
       nullif(v_brand_identity->>'alias_key',''),
       now(),now()
     )
     on conflict(location_id) do update set
       canonical_brand=case
         when excluded.confidence>=public.location_brand_identities.confidence then excluded.canonical_brand
         else public.location_brand_identities.canonical_brand
       end,
       source=case
         when excluded.confidence>=public.location_brand_identities.confidence then excluded.source
         else public.location_brand_identities.source
       end,
       confidence=greatest(public.location_brand_identities.confidence,excluded.confidence),
       alias_key=coalesce(excluded.alias_key,public.location_brand_identities.alias_key),
       updated_at=now()
     where
       (
         excluded.confidence>=public.location_brand_identities.confidence
         and (
           public.location_brand_identities.canonical_brand is distinct from excluded.canonical_brand
           or public.location_brand_identities.source is distinct from excluded.source
           or public.location_brand_identities.confidence is distinct from greatest(public.location_brand_identities.confidence,excluded.confidence)
           or public.location_brand_identities.alias_key is distinct from coalesce(excluded.alias_key,public.location_brand_identities.alias_key)
         )
       )
       or (
         public.location_brand_identities.alias_key is null
         and excluded.alias_key is not null
       );
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
   where
     public.external_location_records.location_id is distinct from excluded.location_id
     or public.external_location_records.latitude is distinct from excluded.latitude
     or public.external_location_records.longitude is distinct from excluded.longitude
     or public.external_location_records.name is distinct from excluded.name
     or public.external_location_records.record_type is distinct from excluded.record_type
     or public.external_location_records.raw_data is distinct from '{}'::jsonb
     or public.external_location_records.active is distinct from true
     or public.external_location_records.last_seen_at is null
     or public.external_location_records.last_seen_at < now()-interval '24 hours';

   update public.location_ingestion_repair_queue
   set resolved_at=now(),updated_at=now()
   where source_key=p_source_key and external_id=ext_id and resolved_at is null;
  exception when others then
   skipped:=skipped+1;
   if ext_id is not null and v_lat between -90 and 90 and v_lng between -180 and 180 then
     insert into public.location_ingestion_repair_queue(source_key,external_id,payload,attempts,last_error_code,next_attempt_at,updated_at)
     values(p_source_key,ext_id,item,0,sqlstate,now()+interval '5 minutes',now())
     on conflict(source_key,external_id) where resolved_at is null
     do update set
       payload=excluded.payload,
       last_error_code=excluded.last_error_code,
       next_attempt_at=least(public.location_ingestion_repair_queue.next_attempt_at,excluded.next_attempt_at),
       updated_at=now();
     queued_repairs:=queued_repairs+1;
   end if;
   row_errors:=row_errors||jsonb_build_array(jsonb_build_object('source_id',ext_id,'code',sqlstate));
  end;
 end loop;

 return jsonb_build_object(
   'imported_locations',imported,
   'verification_candidates',imported,
   'updated_locations',updated,
   'skipped_rows',skipped,
   'queued_repairs',queued_repairs,
   'canonicalization_complete',skipped=0,
   'durably_accounted',skipped=0 or queued_repairs=skipped,
   'errors',row_errors
 );
end;
$function$

