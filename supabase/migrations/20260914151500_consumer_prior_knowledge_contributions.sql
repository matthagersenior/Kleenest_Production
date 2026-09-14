-- Extend the existing canonical Consumer discovery-evidence authority instead of
-- adding another authenticated SECURITY DEFINER RPC. Prior knowledge stays
-- historical, non-presence evidence and cannot become a check-in or fresh amenity signal.

insert into public.progression_xp_actions(
  action,base_xp,specialty,cooldown_seconds,max_per_day,enabled,metadata
)
values(
  'prior_knowledge',8,'community_contributor',0,12,true,
  jsonb_build_object(
    'evidence_class','prior_knowledge',
    'verification','historical_member_report',
    'presence_required',false
  )
)
on conflict(action) do update
set base_xp=excluded.base_xp,
    specialty=excluded.specialty,
    cooldown_seconds=excluded.cooldown_seconds,
    max_per_day=excluded.max_per_day,
    enabled=excluded.enabled,
    metadata=excluded.metadata;

create or replace function public.consumer_record_discovery_evidence(
  p_location_id uuid,p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_method text:=lower(coalesce(nullif(p_input->>'method',''),'remote'));
  v_location public.locations%rowtype;
  v_lat double precision:=nullif(p_input->>'latitude','')::double precision;
  v_lon double precision:=nullif(p_input->>'longitude','')::double precision;
  v_accuracy double precision:=nullif(p_input->>'accuracy_m','')::double precision;
  v_distance double precision;
  v_tier integer;
  v_conf numeric;
  v_obs uuid;
  v_action text;
  v_xp jsonb;
  v_contrib uuid;
  v_amenity_name text;
  v_amenity_id uuid;
  v_amenity_count integer:=0;
  v_amenity_input_count integer:=0;
  v_photo_path text:=nullif(trim(coalesce(p_input->>'photo_path','')),'');
  v_payload jsonb;
  v_prior boolean:=false;
  v_recency text:=lower(trim(coalesce(p_input->>'knowledge_recency','unknown')));
  v_claimed_observed_at timestamptz;
  v_cleanliness text:=lower(trim(coalesce(p_input->>'cleanliness_tendency','unknown')));
  v_facts jsonb:=coalesce(p_input->'facts','[]'::jsonb);
  v_access_notes text:=nullif(trim(coalesce(p_input->>'access_notes','')),'');
  v_notes text:=nullif(trim(coalesce(p_input->>'notes','')),'');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' then
    raise exception 'Evidence payload must be an object';
  end if;
  if v_method not in ('remote','photo_remote','gps','onsite_live','prior_knowledge') then
    raise exception 'Invalid evidence method';
  end if;

  v_prior:=v_method='prior_knowledge';

  select * into v_location
  from public.locations
  where id=p_location_id and coalesce(is_active,true);
  if not found then raise exception 'Location not found or inactive'; end if;

  if v_prior then
    if v_recency not in ('today','this_week','this_month','few_months','long_time','unknown') then
      raise exception 'INVALID_KNOWLEDGE_RECENCY';
    end if;
    if v_cleanliness not in ('usually_spotless','usually_clean','mixed','often_needs_attention','unknown') then
      raise exception 'INVALID_CLEANLINESS_TENDENCY';
    end if;
    if jsonb_typeof(v_facts)<>'array' then raise exception 'FACTS_MUST_BE_ARRAY'; end if;
    if jsonb_array_length(v_facts)>20 then raise exception 'TOO_MANY_FACTS'; end if;
    if p_input ? 'amenities' then raise exception 'PRIOR_KNOWLEDGE_CANNOT_CREATE_AMENITY_EVIDENCE'; end if;
    if length(coalesce(v_access_notes,''))>500 then raise exception 'ACCESS_NOTES_TOO_LONG'; end if;
    if length(coalesce(v_notes,''))>1200 then raise exception 'NOTES_TOO_LONG'; end if;
    if jsonb_array_length(v_facts)=0 and v_cleanliness='unknown' and v_access_notes is null and v_notes is null then
      raise exception 'ADD_SOMETHING_YOU_KNOW';
    end if;

    v_claimed_observed_at:=case v_recency
      when 'today' then date_trunc('day',now())
      when 'this_week' then now()-interval '7 days'
      when 'this_month' then now()-interval '30 days'
      when 'few_months' then now()-interval '120 days'
      when 'long_time' then now()-interval '365 days'
      else now()-interval '730 days'
    end;

    v_conf:=case v_recency
      when 'today' then .35
      when 'this_week' then .30
      when 'this_month' then .25
      when 'few_months' then .20
      when 'long_time' then .15
      else .10
    end;
  elsif v_method in ('gps','onsite_live') then
    if v_lat is null or v_lon is null
       or v_lat not between -90 and 90 or v_lon not between -180 and 180 then
      raise exception 'Nearby GPS is required for GPS/on-site evidence';
    end if;
    if v_location.latitude is null or v_location.longitude is null then
      raise exception 'Location coordinates unavailable for proximity verification';
    end if;
    if v_accuracy is not null and (v_accuracy<0 or v_accuracy>250) then
      raise exception 'GPS accuracy is insufficient';
    end if;

    v_distance:=2*6371000*asin(
      sqrt(
        power(sin(radians(v_lat-v_location.latitude)/2),2)
        + cos(radians(v_location.latitude))*cos(radians(v_lat))
        * power(sin(radians(v_lon-v_location.longitude)/2),2)
      )
    );

    if v_distance>greatest(coalesce(v_location.geofence_radius_m,150),150) then
      raise exception 'Evidence must be within the location geofence';
    end if;
  elsif v_method='photo_remote' then
    if v_photo_path is null or not exists(
      select 1
      from public.discovery_photos p
      where p.location_id=p_location_id
        and p.user_id=v_user
        and p.storage_path=v_photo_path
        and p.moderation_status='visible'
    ) then
      raise exception 'Photo evidence must reference a stored visible discovery photo owned by the current user';
    end if;
  end if;

  if not v_prior then
    if jsonb_typeof(p_input->'amenities')='array' then
      v_amenity_input_count:=jsonb_array_length(p_input->'amenities');
      if v_amenity_input_count>25 then raise exception 'A maximum of 25 amenities may be submitted'; end if;
    elsif p_input ? 'amenities' then
      raise exception 'Amenities must be an array';
    end if;
  end if;

  v_tier:=case v_method when 'onsite_live' then 4 when 'gps' then 3 when 'photo_remote' then 2 else 1 end;
  if not v_prior then
    v_conf:=case v_tier when 4 then .85 when 3 then .70 when 2 then .50 else .30 end;
  end if;

  v_payload:=
    (coalesce(p_input,'{}'::jsonb) - array['latitude','longitude']::text[])
    || jsonb_strip_nulls(jsonb_build_object(
      'observer_distance_m',v_distance,
      'observer_accuracy_m',v_accuracy,
      'server_validated_method',v_method
    ));

  if v_prior then
    v_payload:=v_payload||jsonb_build_object(
      'evidence_class','prior_knowledge',
      'knowledge_recency',v_recency,
      'claimed_observed_at',v_claimed_observed_at,
      'submitted_at',now(),
      'presence_verified',false,
      'visit_verified',false,
      'freshness_eligible',false,
      'canonical_amenity_evidence',false,
      'server_validated',true
    );
  end if;

  insert into public.location_observations(
    location_id,observer_user_id,observation_type,observed_at,latitude,longitude,
    accuracy_m,evidence,confidence,source,expires_at
  )
  values(
    p_location_id,v_user,
    case when v_tier>=4 then 'community_observed' when v_tier>=3 then 'encountered' else 'discovered' end,
    case when v_prior then v_claimed_observed_at else now() end,
    case when v_tier>=3 then v_lat end,
    case when v_tier>=3 then v_lon end,
    case when v_tier>=3 then v_accuracy end,
    v_payload,v_conf,
    case when v_prior then 'consumer_prior_knowledge' else 'consumer_discovery_validated' end,
    case when v_prior then now()+interval '365 days' else now()+interval '30 days' end
  )
  returning id into v_obs;

  if v_method<>'prior_knowledge' and jsonb_typeof(p_input->'amenities')='array' then
    for v_amenity_name in select jsonb_array_elements_text(p_input->'amenities') loop
      select a.id into v_amenity_id
      from public.amenities a
      where lower(a.name)=lower(v_amenity_name)
         or (lower(v_amenity_name)='24-hour access' and lower(a.name) in ('24-hour access','24 hours'))
      order by case when lower(a.name)=lower(v_amenity_name) then 0 else 1 end
      limit 1;

      if v_amenity_id is not null then
        insert into public.location_amenity_observations(
          location_id,user_id,amenity_id,status,confidence,verification_method,
          notes,observed_at,metadata
        )
        values(
          p_location_id,v_user,v_amenity_id,'present',v_conf,
          case
            when v_tier>=4 then 'on_site_live'
            when v_tier>=3 then 'gps'
            when v_tier=2 then 'photo_remote'
            else 'community_discovery'
          end,
          nullif(p_input->>'access_notes',''),now(),
          jsonb_build_object(
            'location_observation_id',v_obs,
            'evidence_tier',v_tier,
            'source','consumer_discovery',
            'server_validated',true
          )
        );
        v_amenity_count:=v_amenity_count+1;
      end if;
      v_amenity_id:=null;
    end loop;
  end if;

  if not v_prior then
    select id into v_contrib
    from public.discovery_contributions
    where location_id=p_location_id and user_id=v_user
    order by created_at desc
    limit 1;

    if v_contrib is null then
      insert into public.discovery_contributions(
        location_id,user_id,method,discovery_state,evidence_tier,confidence,payload
      )
      values(
        p_location_id,v_user,
        case when v_method in ('gps','onsite_live') then v_method else 'remote' end,
        case when v_tier>=4 then 'on_site_observed' else 'documented' end,
        v_tier,v_conf,v_payload
      )
      returning id into v_contrib;
    else
      update public.discovery_contributions
         set evidence_tier=greatest(evidence_tier,v_tier),
             confidence=greatest(confidence,v_conf),
             discovery_state=case
               when v_tier>=4 then 'on_site_observed'
               else case when discovery_state='candidate' then 'documented' else discovery_state end
             end,
             payload=payload||v_payload,
             updated_at=now()
       where id=v_contrib;
    end if;
  end if;

  v_action:=case when v_prior then 'prior_knowledge' when v_amenity_count>0 then 'add_amenity' else 'helpful_contribution' end;
  v_xp:=public.record_progression_event_v2(
    v_action,
    jsonb_strip_nulls(jsonb_build_object(
      'location_id',p_location_id,
      'source_id',v_obs,
      'evidence_tier',v_tier,
      'amenities_recorded',v_amenity_count,
      'evidence_class',case when v_prior then 'prior_knowledge' end,
      'presence_verified',case when v_prior then false end,
      'visit_verified',case when v_prior then false end
    )),
    case
      when v_prior then 'prior-knowledge:'||v_user::text||':'||p_location_id::text||':'||to_char(now(),'YYYY-MM-DD')
      else 'evidence:'||v_obs::text
    end
  );

  return jsonb_build_object(
    'observation_id',v_obs,
    'evidence_tier',v_tier,
    'evidence_class',case when v_prior then 'prior_knowledge' else null end,
    'knowledge_recency',case when v_prior then v_recency else null end,
    'claimed_observed_at',case when v_prior then v_claimed_observed_at else null end,
    'presence_verified',case when v_prior then false else null end,
    'visit_verified',case when v_prior then false else null end,
    'freshness_eligible',case when v_prior then false else null end,
    'confidence',v_conf,
    'observer_distance_m',v_distance,
    'amenities_recorded',v_amenity_count,
    'canonical_amenity_observations',case when v_prior then 0 else v_amenity_count end,
    'xp',v_xp,
    'progression',v_xp
  );
end;
$$;

revoke all on function public.consumer_record_discovery_evidence(uuid,jsonb) from public,anon;
grant execute on function public.consumer_record_discovery_evidence(uuid,jsonb) to authenticated,service_role;

comment on function public.consumer_record_discovery_evidence(uuid,jsonb) is
'Canonical authenticated Consumer discovery/evidence writer. prior_knowledge records historical member knowledge without creating presence, check-ins, verified visits, or canonical fresh amenity evidence.';
