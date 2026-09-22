-- Close the user-discovery -> canonical location -> QR -> claim/review loop.
-- Every valid discovered place is either canonicalized or durably queued for retry.
-- Every canonical location has a stable Kleenest QR identity without pre-materializing every row.

create or replace function public.canonical_location_qr_code(p_location_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_code text;
begin
  if p_location_id is null then return null; end if;
  select q.code into v_code
  from public.qr_codes q
  where q.location_id=p_location_id
    and q.canonical_location_identity
  limit 1;
  if v_code is not null then return v_code; end if;
  return 'KLOC-'||upper(replace(p_location_id::text,'-',''));
end;
$$;

create or replace function public.canonical_location_id_from_qr(p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_code text:=upper(trim(coalesce(p_code,'')));
  v_id uuid;
  v_hex text;
begin
  select q.location_id into v_id
  from public.qr_codes q
  where upper(q.code)=v_code
    and q.canonical_location_identity
    and q.location_id is not null
  limit 1;
  if v_id is not null then return v_id; end if;

  if v_code !~ '^KLOC-[0-9A-F]{32}$' then return null; end if;
  v_hex:=substr(v_code,6);
  begin
    v_id:=(
      substr(v_hex,1,8)||'-'||substr(v_hex,9,4)||'-'||substr(v_hex,13,4)||'-'||
      substr(v_hex,17,4)||'-'||substr(v_hex,21,12)
    )::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  if exists(select 1 from public.locations l where l.id=v_id and coalesce(l.is_active,true)) then
    return v_id;
  end if;
  return null;
end;
$$;

create or replace function public.materialize_canonical_location_qr_identity(p_location_id uuid)
returns public.qr_codes
language plpgsql
security definer
set search_path=''
as $$
declare
  v_location public.locations%rowtype;
  v_qr public.qr_codes%rowtype;
  v_business uuid;
  v_code text;
begin
  select * into v_location
  from public.locations
  where id=p_location_id and coalesce(is_active,true)
  limit 1;
  if not found then raise exception 'Location not found or inactive'; end if;

  v_business:=coalesce(
    v_location.claimed_business_id,
    v_location.business_id,
    (
      select lc.business_id
      from public.location_claims lc
      where lc.location_id=p_location_id
        and lower(coalesce(lc.status,'')) in ('approved','verified','active','claimed')
      order by lc.updated_at desc nulls last,lc.created_at desc nulls last
      limit 1
    )
  );

  select * into v_qr
  from public.qr_codes q
  where q.location_id=p_location_id and q.canonical_location_identity
  limit 1
  for update;

  if not found then
    v_code:=public.canonical_location_qr_code(p_location_id);
    insert into public.qr_codes(
      business_id,location_id,code,active,label,customization,purpose,action_type,
      action_payload,single_use,max_redemptions,canonical_location_identity,
      identity_scope,placement_status
    )
    values(
      v_business,
      p_location_id,
      v_code,
      true,
      coalesce(nullif(trim(coalesce(v_location.name,'')),''),'Kleenest location')||' · Kleenest Location QR',
      public.qr_studio_validate_customization('{}'::jsonb),
      'location_identity',
      'location_details',
      jsonb_build_object(
        'location_id',p_location_id,
        'route','location',
        'feedback_route','location',
        'review_requires_verified_visit',true,
        'canonical_location_identity',true
      ),
      false,null,true,
      case when v_business is null then 'community' else 'business' end,
      'digital_only'
    )
    on conflict do nothing;

    select * into v_qr
    from public.qr_codes q
    where q.location_id=p_location_id and q.canonical_location_identity
    limit 1
    for update;
    if not found then raise exception 'Canonical location QR could not be materialized'; end if;
  end if;

  if v_qr.business_id is distinct from v_business
     or v_qr.identity_scope is distinct from (case when v_business is null then 'community' else 'business' end)
     or coalesce(v_qr.action_payload,'{}'::jsonb)->>'location_id' is distinct from p_location_id::text then
    update public.qr_codes
    set business_id=v_business,
        identity_scope=case when v_business is null then 'community' else 'business' end,
        action_payload=coalesce(action_payload,'{}'::jsonb)||jsonb_build_object(
          'location_id',p_location_id,
          'route','location',
          'feedback_route','location',
          'review_requires_verified_visit',true,
          'canonical_location_identity',true
        )
    where id=v_qr.id
    returning * into v_qr;
  end if;

  return v_qr;
end;
$$;

revoke all on function public.materialize_canonical_location_qr_identity(uuid) from public,anon,authenticated;
grant execute on function public.materialize_canonical_location_qr_identity(uuid) to service_role;

create or replace function public.resolve_location_external_identity_v2(
  p_source_dataset text,
  p_source_external_id text,
  p_latitude double precision,
  p_longitude double precision,
  p_name text default null,
  p_brand text default null,
  p_operator text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_brand_key text:=public.normalize_brand_key(p_brand);
  v_name_key text:=public.normalize_brand_key(p_name);
begin
  if p_source_dataset is not null and p_source_external_id is not null then
    select l.id into v_id
    from public.locations l
    where l.source_dataset=p_source_dataset
      and l.source_external_id=p_source_external_id
    limit 1;
    if v_id is not null then return v_id; end if;

    select elr.location_id into v_id
    from public.external_location_records elr
    join public.external_data_sources eds on eds.id=elr.source_id
    where eds.source_key=p_source_dataset
      and elr.external_id=p_source_external_id
      and elr.location_id is not null
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if p_latitude is null or p_longitude is null then return null; end if;

  select l.id into v_id
  from public.locations l
  left join public.location_brand_identities bi on bi.location_id=l.id
  where coalesce(l.is_active,true)
    and l.latitude between p_latitude-0.00055 and p_latitude+0.00055
    and l.longitude between p_longitude-0.00055 and p_longitude+0.00055
    and (
      (v_brand_key is not null and public.normalize_brand_key(coalesce(bi.canonical_brand,l.brand_name))=v_brand_key)
      or (v_name_key is not null and public.normalize_brand_key(l.name)=v_name_key)
      or (
        nullif(trim(coalesce(p_address,'')),'') is not null
        and lower(trim(coalesce(l.address,'')))=lower(trim(p_address))
        and (nullif(trim(coalesce(p_city,'')),'') is null or lower(trim(coalesce(l.city,'')))=lower(trim(p_city)))
        and (nullif(trim(coalesce(p_state,'')),'') is null or lower(trim(coalesce(l.state,'')))=lower(trim(p_state)))
      )
    )
  order by
    case
      when v_brand_key is not null and public.normalize_brand_key(coalesce(bi.canonical_brand,l.brand_name))=v_brand_key then 0
      when v_name_key is not null and public.normalize_brand_key(l.name)=v_name_key then 1
      else 2
    end,
    abs(l.latitude-p_latitude)+abs(l.longitude-p_longitude)
  limit 1;

  return v_id;
end;
$$;

revoke all on function public.resolve_location_external_identity_v2(text,text,double precision,double precision,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_location_external_identity_v2(text,text,double precision,double precision,text,text,text,text,text,text) to service_role;

create table if not exists public.location_ingestion_repair_queue(
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  external_id text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  last_error_code text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists location_ingestion_repair_queue_open_uidx
  on public.location_ingestion_repair_queue(source_key,external_id)
  where resolved_at is null;
create index if not exists location_ingestion_repair_queue_due_idx
  on public.location_ingestion_repair_queue(next_attempt_at,attempts)
  where resolved_at is null;

alter table public.location_ingestion_repair_queue enable row level security;
revoke all on public.location_ingestion_repair_queue from anon,authenticated;
grant select,insert,update,delete on public.location_ingestion_repair_queue to service_role;

create or replace function public.ingest_external_locations(p_source_key text,p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
set statement_timeout='90s'
as $$
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
    where l.id=loc_id;
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
       canonical_brand=excluded.canonical_brand,
       source=excluded.source,
       confidence=greatest(public.location_brand_identities.confidence,excluded.confidence),
       alias_key=coalesce(excluded.alias_key,public.location_brand_identities.alias_key),
       updated_at=now()
     where excluded.confidence>=public.location_brand_identities.confidence
        or public.location_brand_identities.canonical_brand=excluded.canonical_brand;
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
     active=true;

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
$$;

create or replace function public.retry_location_ingestion_repairs(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path=''
set statement_timeout='90s'
as $$
declare
  r record;
  v_result jsonb;
  v_retried integer:=0;
  v_resolved integer:=0;
  v_failed integer:=0;
begin
  if current_user not in ('service_role','postgres') then raise exception 'service role required'; end if;
  for r in
    select *
    from public.location_ingestion_repair_queue
    where resolved_at is null and next_attempt_at<=now()
    order by next_attempt_at,created_at
    limit greatest(1,least(coalesce(p_limit,50),200))
    for update skip locked
  loop
    v_retried:=v_retried+1;
    begin
      v_result:=public.ingest_external_locations(r.source_key,jsonb_build_array(r.payload));
      if coalesce((v_result->>'skipped_rows')::integer,0)=0 then
        update public.location_ingestion_repair_queue
        set resolved_at=now(),updated_at=now()
        where id=r.id;
        v_resolved:=v_resolved+1;
      else
        update public.location_ingestion_repair_queue
        set attempts=attempts+1,
            last_error_code=coalesce(v_result#>>'{errors,0,code}',last_error_code),
            next_attempt_at=now()+least(interval '6 hours',interval '5 minutes'*power(2,least(attempts,6))),
            updated_at=now()
        where id=r.id;
        v_failed:=v_failed+1;
      end if;
    exception when others then
      update public.location_ingestion_repair_queue
      set attempts=attempts+1,
          last_error_code=sqlstate,
          next_attempt_at=now()+least(interval '6 hours',interval '5 minutes'*power(2,least(attempts,6))),
          updated_at=now()
      where id=r.id;
      v_failed:=v_failed+1;
    end;
  end loop;
  return jsonb_build_object('retried',v_retried,'resolved',v_resolved,'still_queued',v_failed);
end;
$$;

revoke all on function public.retry_location_ingestion_repairs(integer) from public,anon,authenticated;
grant execute on function public.retry_location_ingestion_repairs(integer) to service_role;

create or replace function public.ensure_location_qr_identity(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_location public.locations%rowtype;
  v_qr public.qr_codes%rowtype;
  v_business public.businesses%rowtype;
  v_business_id uuid;
  v_network jsonb:='{}'::jsonb;
  v_network_verified boolean:=false;
  v_business_claimed boolean:=false;
  v_trust_state text:='community';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_location
  from public.locations
  where id=p_location_id and coalesce(is_active,true)
  limit 1;
  if not found then raise exception 'Location not found or inactive'; end if;

  v_qr:=public.materialize_canonical_location_qr_identity(p_location_id);
  v_business_id:=v_qr.business_id;
  if v_business_id is not null then
    select * into v_business from public.businesses where id=v_business_id;
  end if;

  begin
    select t.value into v_network
    from public.mobile_location_network_statuses(array[p_location_id]::uuid[]) as t(value)
    limit 1;
  exception when others then
    v_network:='{}'::jsonb;
  end;
  v_network_verified:=coalesce((v_network->>'network_verified')::boolean,false);
  v_business_claimed:=coalesce((v_network->>'business_claimed')::boolean,false) or v_business_id is not null;
  v_trust_state:=case
    when v_business_claimed then 'business_claimed'
    when v_network_verified then 'kleenest_verified'
    when v_qr.placement_status='placement_verified' then 'placement_verified'
    else 'community'
  end;

  return jsonb_build_object(
    'id',v_qr.id,'code',v_qr.code,'location_id',v_location.id,
    'location_name',v_location.name,'location_address',v_location.address,
    'location_city',v_location.city,'location_state',v_location.state,'location_postal_code',v_location.postal_code,
    'location_place_type',v_location.place_type,'brand_name',v_location.brand_name,
    'rating',v_location.rating,'review_count',v_location.review_count,
    'business_id',v_business_id,'business_name',v_business.name,'business_logo_url',v_business.logo_url,
    'business_website',v_business.website,'business_description',v_business.description,
    'label',v_qr.label,'purpose',v_qr.purpose,'action_type',v_qr.action_type,
    'action_payload',coalesce(v_qr.action_payload,'{}'::jsonb),
    'single_use',coalesce(v_qr.single_use,false),'canonical_location_identity',true,
    'qr_scope',case when v_business_id is null then 'community' else 'business' end,
    'placement_status',v_qr.placement_status,'trust_state',v_trust_state,
    'business_claimed',v_business_claimed,'network_verified',v_network_verified,
    'claimable',not v_business_claimed,'network',v_network,
    'feedback_available',true,'review_requires_verified_visit',true,
    'location_route','/location/'||v_location.id::text,
    'deep_link','kleenest://qr?code='||v_qr.code
  );
end;
$$;

create or replace function public.resolve_custom_qr_action(p_qr_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_qr public.qr_codes%rowtype;
  v_location public.locations%rowtype;
  v_business public.businesses%rowtype;
  v_business_id uuid;
  v_location_id uuid;
  v_network jsonb:='{}'::jsonb;
  v_network_verified boolean:=false;
  v_business_claimed boolean:=false;
  v_trust_state text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(trim(coalesce(p_qr_code,'')),'') is null then raise exception 'QR code is required'; end if;

  select * into v_qr from public.qr_codes where code=trim(p_qr_code) and active=true limit 1;
  if not found then
    v_location_id:=public.canonical_location_id_from_qr(p_qr_code);
    if v_location_id is not null then
      v_qr:=public.materialize_canonical_location_qr_identity(v_location_id);
    end if;
  end if;
  if v_qr.id is null then raise exception 'Invalid or inactive Kleenest QR'; end if;

  if v_qr.location_id is not null then
    select * into v_location from public.locations where id=v_qr.location_id and coalesce(is_active,true) limit 1;
    if not found then raise exception 'QR location unavailable'; end if;
    v_business_id:=coalesce(
      v_qr.business_id,v_location.claimed_business_id,v_location.business_id,
      (select lc.business_id from public.location_claims lc
       where lc.location_id=v_qr.location_id
         and lower(coalesce(lc.status,'')) in ('approved','verified','active','claimed')
       order by lc.updated_at desc nulls last,lc.created_at desc nulls last limit 1)
    );
    if v_business_id is not null then select * into v_business from public.businesses where id=v_business_id; end if;
    begin
      select t.value into v_network
      from public.mobile_location_network_statuses(array[v_qr.location_id]::uuid[]) as t(value)
      limit 1;
    exception when others then v_network:='{}'::jsonb; end;
  else
    v_business_id:=v_qr.business_id;
    if v_business_id is not null then select * into v_business from public.businesses where id=v_business_id; end if;
  end if;

  v_network_verified:=coalesce((v_network->>'network_verified')::boolean,false);
  v_business_claimed:=coalesce((v_network->>'business_claimed')::boolean,false) or v_business_id is not null;
  v_trust_state:=case
    when v_business_claimed then 'business_claimed'
    when v_network_verified then 'kleenest_verified'
    when coalesce(v_qr.placement_status,'digital_only')='placement_verified' then 'placement_verified'
    else 'community'
  end;

  return jsonb_build_object(
    'id',v_qr.id,'code',v_qr.code,'location_id',v_qr.location_id,
    'location_name',v_location.name,'location_address',v_location.address,
    'location_city',v_location.city,'location_state',v_location.state,'location_postal_code',v_location.postal_code,
    'location_place_type',v_location.place_type,'brand_name',v_location.brand_name,
    'rating',v_location.rating,'review_count',v_location.review_count,
    'business_id',v_business_id,'business_name',v_business.name,'business_logo_url',v_business.logo_url,
    'business_website',v_business.website,'business_description',v_business.description,
    'label',v_qr.label,'purpose',v_qr.purpose,
    'action_type',lower(coalesce(v_qr.action_type,'location_details')),
    'action_payload',coalesce(v_qr.action_payload,'{}'::jsonb),
    'single_use',coalesce(v_qr.single_use,false),
    'canonical_location_identity',coalesce(v_qr.canonical_location_identity,false),
    'qr_scope',case when coalesce(v_qr.canonical_location_identity,false) and v_business_id is null then 'community'
                    when coalesce(v_qr.canonical_location_identity,false) then 'business'
                    else coalesce(v_qr.identity_scope,'business') end,
    'placement_status',coalesce(v_qr.placement_status,'digital_only'),
    'trust_state',v_trust_state,'business_claimed',v_business_claimed,
    'network_verified',v_network_verified,
    'claimable',coalesce(v_qr.canonical_location_identity,false) and not v_business_claimed,
    'network',v_network,
    'feedback_available',v_qr.location_id is not null,
    'review_requires_verified_visit',v_qr.location_id is not null,
    'location_route',case when v_qr.location_id is null then null else '/location/'||v_qr.location_id::text end,
    'deep_link','kleenest://qr?code='||v_qr.code
  );
end;
$$;

create or replace function public.get_public_qr_landing(p_qr_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  q public.qr_codes%rowtype;
  b public.businesses%rowtype;
  l public.locations%rowtype;
  v_location_id uuid;
  v jsonb;
begin
  if nullif(trim(coalesce(p_qr_code,'')),'') is null or length(trim(p_qr_code))>256 then
    raise exception 'Invalid Kleenest QR';
  end if;

  select * into q from public.qr_codes where code=trim(p_qr_code) and active=true limit 1;
  if not found then
    v_location_id:=public.canonical_location_id_from_qr(p_qr_code);
    if v_location_id is not null then q:=public.materialize_canonical_location_qr_identity(v_location_id); end if;
  end if;
  if q.id is null then raise exception 'Invalid or inactive Kleenest QR'; end if;

  if q.location_id is not null then select * into l from public.locations where id=q.location_id and is_active=true; end if;
  if q.business_id is not null then select * into b from public.businesses where id=q.business_id; end if;

  v:=jsonb_build_object(
    'id',q.id,'code',q.code,'business_id',q.business_id,
    'business_name',b.name,'business_logo_url',b.logo_url,'business_website',b.website,'business_description',b.description,
    'location_id',q.location_id,'location_name',l.name,'address',l.address,'city',l.city,'state',l.state,'postal_code',l.postal_code,
    'brand_name',l.brand_name,'rating',l.rating,'review_count',l.review_count,'place_type',l.place_type,
    'label',q.label,'purpose',q.purpose,'action_type',q.action_type,
    'action_payload',public.public_qr_action_payload(q.action_type,q.action_payload),
    'customization',q.customization,
    'canonical_location_identity',q.canonical_location_identity,
    'feedback_available',q.location_id is not null,
    'review_requires_verified_visit',q.location_id is not null,
    'location_route',case when q.location_id is null then null else '/location/'||q.location_id::text end
  );

  insert into public.qr_attribution_events(qr_code_id,location_id,business_id,user_id,action_type,source,metadata)
  values(q.id,q.location_id,q.business_id,auth.uid(),'scan','public_qr_landing',jsonb_build_object('anonymous',auth.uid() is null));

  return v;
end;
$$;

create or replace function public.verify_checkin(
  p_qr_code text,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision
)
returns public.check_ins
language plpgsql
security definer
set search_path=''
as $$
declare
  v_qr public.qr_codes%rowtype;
  v_location_id uuid;
  v_result jsonb;
  v_check public.check_ins%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'LOCATION_REQUIRED';
  end if;

  select * into v_qr from public.qr_codes where code=trim(p_qr_code) and active=true limit 1;
  if not found then
    v_location_id:=public.canonical_location_id_from_qr(p_qr_code);
    if v_location_id is not null then v_qr:=public.materialize_canonical_location_qr_identity(v_location_id); end if;
  end if;
  if v_qr.id is null or v_qr.location_id is null then raise exception 'Invalid or inactive QR code'; end if;

  v_result:=public.kleenest_map_check_in_v2(v_qr.location_id,p_lat,p_lng,p_accuracy_m);

  update public.check_ins
  set qr_code_id=v_qr.id,
      verification_method='qr',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'source','qr','qr_code_id',v_qr.id,
        'canonical_location_identity',coalesce(v_qr.canonical_location_identity,false),
        'qr_scope',case when v_qr.business_id is null then 'community' else 'business' end,
        'reported_accuracy_m',p_accuracy_m
      )
  where id=(v_result->>'check_in_id')::uuid and user_id=auth.uid()
  returning * into v_check;

  if v_check.id is null then raise exception 'QR check-in could not be finalized'; end if;
  perform public.record_qr_attribution(v_qr.code,'checkin','consumer_mobile',
    jsonb_build_object('check_in_id',v_check.id,'verification_method','qr'));
  return v_check;
end;
$$;

-- Keep existing 3-arg callers working.
create or replace function public.verify_checkin(
  p_qr_code text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns public.check_ins
language sql
security definer
set search_path=''
as $verify$
  select public.verify_checkin(p_qr_code,p_lat,p_lng,null::double precision);
$verify$;

revoke execute on function public.verify_checkin(text,double precision,double precision,double precision) from public,anon;
grant execute on function public.verify_checkin(text,double precision,double precision,double precision) to authenticated,service_role;
revoke execute on function public.verify_checkin(text,double precision,double precision) from public,anon;
grant execute on function public.verify_checkin(text,double precision,double precision) to authenticated,service_role;

revoke all on function public.canonical_location_qr_code(uuid) from public,anon,authenticated;
grant execute on function public.canonical_location_qr_code(uuid) to service_role;
revoke all on function public.canonical_location_id_from_qr(text) from public,anon,authenticated;
grant execute on function public.canonical_location_id_from_qr(text) to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='location-ingestion-repair') then
      perform cron.unschedule('location-ingestion-repair');
    end if;
    perform cron.schedule(
      'location-ingestion-repair',
      '*/5 * * * *',
      'select public.retry_location_ingestion_repairs(50);'
    );
  end if;
end;
$$;
