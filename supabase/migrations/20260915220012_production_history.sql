-- Previous-visit photos are historical evidence, not current presence.
-- They use the existing discovery-photos bucket but never create a check-in or
-- current-freshness claim.

create or replace function public.consumer_attach_prior_knowledge_photos(
  p_location_id uuid,
  p_knowledge_recency text,
  p_photos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_location public.locations%rowtype;
  v_recency text:=lower(trim(coalesce(p_knowledge_recency,'unknown')));
  v_photo jsonb;
  v_path text;
  v_mime text;
  v_size bigint;
  v_width integer;
  v_height integer;
  v_count integer;
  v_discovery_id uuid;
  v_photo_id uuid;
  v_photo_ids jsonb:='[]'::jsonb;
  v_observed_at timestamptz;
  v_conf numeric;
  v_observation_id uuid;
  v_xp jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_location_id is null then raise exception 'LOCATION_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_photos,'[]'::jsonb))<>'array' then raise exception 'PHOTOS_MUST_BE_ARRAY'; end if;

  v_count:=jsonb_array_length(p_photos);
  if v_count<1 or v_count>3 then raise exception 'PHOTO_COUNT_OUT_OF_RANGE'; end if;
  if v_recency not in ('today','this_week','this_month','few_months','long_time','unknown') then
    raise exception 'INVALID_KNOWLEDGE_RECENCY';
  end if;

  select * into v_location
  from public.locations
  where id=p_location_id and coalesce(is_active,true);
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;

  for v_photo in select value from jsonb_array_elements(p_photos) as t(value) loop
    v_path:=nullif(trim(coalesce(v_photo->>'storage_path','')),'');
    v_mime:=nullif(trim(coalesce(v_photo->>'mime_type','')),'');
    v_size:=nullif(v_photo->>'size_bytes','')::bigint;
    v_width:=nullif(v_photo->>'width','')::integer;
    v_height:=nullif(v_photo->>'height','')::integer;

    if v_path is null or split_part(v_path,'/',1)<>v_user::text then
      raise exception 'PHOTO_PATH_NOT_OWNED';
    end if;
    if v_mime is not null and v_mime not in ('image/jpeg','image/png','image/webp') then
      raise exception 'UNSUPPORTED_IMAGE_TYPE';
    end if;
    if v_size is not null and (v_size<0 or v_size>8388608) then
      raise exception 'PHOTO_SIZE_OUT_OF_RANGE';
    end if;
    if v_width is not null and v_width<=0 then raise exception 'PHOTO_WIDTH_INVALID'; end if;
    if v_height is not null and v_height<=0 then raise exception 'PHOTO_HEIGHT_INVALID'; end if;
    if not exists(
      select 1 from storage.objects o
      where o.bucket_id='discovery-photos' and o.name=v_path
    ) then
      raise exception 'DISCOVERY_PHOTO_OBJECT_NOT_FOUND';
    end if;
  end loop;

  v_observed_at:=case v_recency
    when 'today' then date_trunc('day',now())
    when 'this_week' then now()-interval '7 days'
    when 'this_month' then now()-interval '30 days'
    when 'few_months' then now()-interval '120 days'
    when 'long_time' then now()-interval '365 days'
    else now()-interval '730 days'
  end;
  v_conf:=case v_recency
    when 'today' then .40
    when 'this_week' then .35
    when 'this_month' then .30
    when 'few_months' then .24
    when 'long_time' then .18
    else .12
  end;

  insert into public.discovery_contributions(
    location_id,user_id,method,discovery_state,evidence_tier,confidence,payload
  )
  values(
    p_location_id,v_user,'remote','documented',2,v_conf,
    jsonb_build_object(
      'evidence_class','prior_visit_photo',
      'knowledge_recency',v_recency,
      'presence_verified',false,
      'visit_verified',false,
      'freshness_eligible',false,
      'photo_count',v_count,
      'submitted_at',now()
    )
  )
  returning id into v_discovery_id;

  for v_photo in select value from jsonb_array_elements(p_photos) as t(value) loop
    v_path:=trim(v_photo->>'storage_path');
    v_mime:=nullif(trim(coalesce(v_photo->>'mime_type','')),'');
    v_size:=nullif(v_photo->>'size_bytes','')::bigint;
    v_width:=nullif(v_photo->>'width','')::integer;
    v_height:=nullif(v_photo->>'height','')::integer;

    insert into public.discovery_photos(
      discovery_id,location_id,user_id,storage_path,mime_type,size_bytes,width,height
    )
    values(
      v_discovery_id,p_location_id,v_user,v_path,v_mime,v_size,v_width,v_height
    )
    returning id into v_photo_id;
    v_photo_ids:=v_photo_ids||jsonb_build_array(v_photo_id);
  end loop;

  insert into public.location_observations(
    location_id,observer_user_id,observation_type,observed_at,
    evidence,confidence,source,expires_at
  )
  values(
    p_location_id,v_user,'discovered',v_observed_at,
    jsonb_build_object(
      'evidence_class','prior_visit_photo',
      'knowledge_recency',v_recency,
      'photo_ids',v_photo_ids,
      'presence_verified',false,
      'visit_verified',false,
      'freshness_eligible',false,
      'claimed_observed_at',v_observed_at,
      'submitted_at',now(),
      'server_validated',true
    ),
    v_conf,'consumer_prior_photo',now()+interval '365 days'
  )
  returning id into v_observation_id;

  v_xp:=public.record_progression_event_v2(
    'prior_knowledge',
    jsonb_build_object(
      'location_id',p_location_id,
      'source_id',v_observation_id,
      'evidence_tier',2,
      'photo_count',v_count,
      'evidence_source','prior_visit_photo'
    ),
    'prior-photo:'||v_observation_id::text
  );

  return jsonb_build_object(
    'location_id',p_location_id,
    'discovery_id',v_discovery_id,
    'observation_id',v_observation_id,
    'photo_ids',v_photo_ids,
    'photo_count',v_count,
    'knowledge_recency',v_recency,
    'freshness_eligible',false,
    'xp',v_xp
  );
end;
$function$;

revoke all on function public.consumer_attach_prior_knowledge_photos(uuid,text,jsonb) from public,anon;
grant execute on function public.consumer_attach_prior_knowledge_photos(uuid,text,jsonb) to authenticated,service_role;
