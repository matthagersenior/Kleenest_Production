
create or replace function public.record_location_observation(
  p_location_id uuid,
  p_observation_type text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null,
  p_evidence jsonb default '{}'::jsonb,
  p_confidence numeric default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_type text:=lower(trim(coalesce(p_observation_type,'')));
  v_location public.locations%rowtype;
  v_distance double precision;
  v_confidence numeric;
  v_id uuid;
  v_lat double precision;
  v_lng double precision;
  v_accuracy double precision;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_location
  from public.locations
  where id=p_location_id and coalesce(is_active,true);
  if not found then raise exception 'Location not found or inactive'; end if;

  if v_type not in ('discovered','encountered','arrived','community_observed') then
    raise exception 'Observation type requires a privileged server workflow';
  end if;

  if p_accuracy_m is not null and (p_accuracy_m<0 or p_accuracy_m>1000) then
    raise exception 'Invalid GPS accuracy';
  end if;

  if v_type='discovered' then
    v_lat:=null;
    v_lng:=null;
    v_accuracy:=null;
    v_confidence:=0.25;
  else
    if p_latitude is null or p_longitude is null
       or p_latitude not between -90 and 90
       or p_longitude not between -180 and 180 then
      raise exception 'Nearby GPS is required for this observation type';
    end if;
    if v_location.latitude is null or v_location.longitude is null then
      raise exception 'Location coordinates unavailable for proximity verification';
    end if;

    v_distance:=2*6371000*asin(
      sqrt(
        power(sin(radians(p_latitude-v_location.latitude)/2),2)
        + cos(radians(v_location.latitude))*cos(radians(p_latitude))
        * power(sin(radians(p_longitude-v_location.longitude)/2),2)
      )
    );

    if v_distance>greatest(coalesce(v_location.geofence_radius_m,150),150) then
      raise exception 'Observation must be within the location geofence';
    end if;

    v_lat:=p_latitude;
    v_lng:=p_longitude;
    v_accuracy:=p_accuracy_m;
    v_confidence:=case v_type
      when 'arrived' then 0.75
      when 'community_observed' then 0.70
      else 0.60
    end;
  end if;

  insert into public.location_observations(
    location_id,observer_user_id,observation_type,latitude,longitude,accuracy_m,
    evidence,confidence,source,expires_at
  )
  values(
    p_location_id,v_user,v_type,v_lat,v_lng,v_accuracy,
    coalesce(p_evidence,'{}'::jsonb)
      || jsonb_build_object(
        'server_validated',true,
        'observer_distance_m',v_distance,
        'submitted_confidence_ignored',p_confidence is not null
      ),
    v_confidence,'app_validated',
    least(coalesce(p_expires_at,now()+interval '30 days'),now()+interval '30 days')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_location_observation(
  uuid,text,double precision,double precision,double precision,jsonb,numeric,timestamptz
) from public,anon;
grant execute on function public.record_location_observation(
  uuid,text,double precision,double precision,double precision,jsonb,numeric,timestamptz
) to authenticated,service_role;

create or replace function public.consumer_match_or_create_discovery(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_name text:=nullif(btrim(p_input->>'name'),'');
  v_address text:=nullif(btrim(p_input->>'address'),'');
  v_lat double precision:=nullif(p_input->>'latitude','')::double precision;
  v_lon double precision:=nullif(p_input->>'longitude','')::double precision;
  v_method text:=lower(coalesce(nullif(p_input->>'method',''),'remote'));
  v_observer_lat double precision:=nullif(p_input->>'observer_latitude','')::double precision;
  v_observer_lon double precision:=nullif(p_input->>'observer_longitude','')::double precision;
  v_observer_accuracy double precision:=nullif(p_input->>'observer_accuracy_m','')::double precision;
  v_distance double precision;
  v_target_lat double precision;
  v_target_lon double precision;
  v_loc public.locations%rowtype;
  v_new boolean:=false;
  v_tier integer;
  v_conf numeric;
  v_state text;
  v_contrib uuid;
  v_xp jsonb;
  v_payload jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' then
    raise exception 'Discovery payload must be an object';
  end if;
  if v_method not in ('remote','address','place_search','map_pin','gps','onsite_live') then
    raise exception 'Invalid discovery method';
  end if;
  if v_name is null and v_address is null and (v_lat is null or v_lon is null) then
    raise exception 'Name, address, or coordinates required';
  end if;
  if (v_lat is null) <> (v_lon is null)
     or (v_lat is not null and (v_lat not between -90 and 90 or v_lon not between -180 and 180)) then
    raise exception 'Valid location coordinates are required together';
  end if;

  select * into v_loc
  from public.locations l
  where l.is_active is distinct from false
    and (
      (
        v_lat is not null and v_lon is not null
        and l.latitude between v_lat-0.001 and v_lat+0.001
        and l.longitude between v_lon-0.001 and v_lon+0.001
        and (v_name is null or lower(l.name)=lower(v_name))
      )
      or (
        v_address is not null
        and lower(coalesce(l.address,''))=lower(v_address)
        and (v_name is null or lower(l.name)=lower(v_name))
      )
      or (
        nullif(p_input->>'external_id','') is not null
        and l.source_external_id=p_input->>'external_id'
        and (p_input->>'external_source' is null or l.source_dataset=p_input->>'external_source')
      )
    )
  order by l.verification_confidence desc nulls last,l.created_at asc
  limit 1;

  v_target_lat:=coalesce(v_loc.latitude,v_lat);
  v_target_lon:=coalesce(v_loc.longitude,v_lon);

  if v_method in ('gps','onsite_live') then
    if v_observer_lat is null or v_observer_lon is null
       or v_observer_lat not between -90 and 90
       or v_observer_lon not between -180 and 180 then
      raise exception 'Observer GPS is required for GPS/on-site discovery';
    end if;
    if v_target_lat is null or v_target_lon is null then
      raise exception 'Location coordinates are required for GPS/on-site discovery';
    end if;
    if v_observer_accuracy is not null and (v_observer_accuracy<0 or v_observer_accuracy>250) then
      raise exception 'Observer GPS accuracy is insufficient';
    end if;

    v_distance:=2*6371000*asin(
      sqrt(
        power(sin(radians(v_observer_lat-v_target_lat)/2),2)
        + cos(radians(v_target_lat))*cos(radians(v_observer_lat))
        * power(sin(radians(v_observer_lon-v_target_lon)/2),2)
      )
    );

    if v_distance>greatest(coalesce(v_loc.geofence_radius_m,150),150) then
      raise exception 'Observer must be within the location geofence for GPS/on-site discovery';
    end if;
  end if;

  v_payload:=
    (coalesce(p_input,'{}'::jsonb)
      - array['observer_latitude','observer_longitude']::text[])
    || jsonb_strip_nulls(jsonb_build_object(
      'observer_distance_m',v_distance,
      'observer_accuracy_m',v_observer_accuracy,
      'server_validated_method',v_method
    ));

  if v_loc.id is null then
    insert into public.locations(
      name,address,latitude,longitude,place_type,source,source_dataset,source_external_id,
      source_metadata,created_by,is_active
    )
    values(
      coalesce(v_name,'Community discovery'),v_address,v_lat,v_lon,
      coalesce(p_input->>'place_type','place'),'community_discovery',
      p_input->>'external_source',p_input->>'external_id',
      jsonb_build_object(
        'discovery_method',v_method,
        'submitted_payload',v_payload
      ),
      v_user,true
    )
    returning * into v_loc;
    v_new:=true;
  end if;

  v_tier:=case v_method
    when 'onsite_live' then 4
    when 'gps' then 3
    when 'map_pin' then 2
    when 'address' then 2
    when 'place_search' then 2
    else 1
  end;
  v_conf:=case v_tier when 4 then .80 when 3 then .65 when 2 then .45 else .25 end;
  v_state:=case when v_tier>=4 then 'on_site_observed' when v_tier>=2 then 'located' else 'candidate' end;

  insert into public.discovery_contributions(
    location_id,user_id,method,discovery_state,evidence_tier,confidence,payload
  )
  values(v_loc.id,v_user,v_method,v_state,v_tier,v_conf,v_payload)
  returning id into v_contrib;

  insert into public.location_submissions(location_id,submitted_by,payload,status)
  values(
    v_loc.id,v_user,
    v_payload||jsonb_build_object(
      'discovery_contribution_id',v_contrib,
      'method',v_method,
      'evidence_tier',v_tier
    ),
    'pending_review'
  );

  if v_method in ('gps','onsite_live') then
    insert into public.location_observations(
      location_id,observer_user_id,observation_type,observed_at,latitude,longitude,
      accuracy_m,evidence,confidence,source,expires_at
    )
    values(
      v_loc.id,v_user,
      case when v_method='onsite_live' then 'community_observed' else 'encountered' end,
      now(),v_observer_lat,v_observer_lon,v_observer_accuracy,
      jsonb_build_object(
        'discovery_contribution_id',v_contrib,
        'observer_distance_m',v_distance,
        'server_validated',true
      ),
      v_conf,'consumer_discovery_validated',now()+interval '30 days'
    );
  end if;

  v_xp:=public.record_progression_event_v2(
    case v_method
      when 'onsite_live' then 'discover_onsite_live'
      when 'gps' then 'discover_gps'
      when 'map_pin' then 'discover_map_pin'
      when 'address' then 'discover_address'
      else 'discover_remote'
    end,
    jsonb_build_object(
      'location_id',v_loc.id,
      'source_id',v_contrib,
      'evidence_tier',v_tier,
      'new_location',v_new
    ),
    'discovery:'||v_contrib::text
  );

  return jsonb_build_object(
    'location_id',v_loc.id,
    'matched_existing',not v_new,
    'discovery_id',v_contrib,
    'discovery_state',v_state,
    'evidence_tier',v_tier,
    'confidence',v_conf,
    'observer_distance_m',v_distance,
    'xp',v_xp
  );
end;
$$;

revoke all on function public.consumer_match_or_create_discovery(jsonb) from public,anon;
grant execute on function public.consumer_match_or_create_discovery(jsonb) to authenticated,service_role;

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
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' then
    raise exception 'Evidence payload must be an object';
  end if;
  if v_method not in ('remote','photo_remote','gps','onsite_live') then
    raise exception 'Invalid evidence method';
  end if;

  select * into v_location
  from public.locations
  where id=p_location_id and coalesce(is_active,true);
  if not found then raise exception 'Location not found or inactive'; end if;

  if v_method in ('gps','onsite_live') then
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

  if jsonb_typeof(p_input->'amenities')='array' then
    v_amenity_input_count:=jsonb_array_length(p_input->'amenities');
    if v_amenity_input_count>25 then raise exception 'A maximum of 25 amenities may be submitted'; end if;
  elsif p_input ? 'amenities' then
    raise exception 'Amenities must be an array';
  end if;

  v_tier:=case v_method when 'onsite_live' then 4 when 'gps' then 3 when 'photo_remote' then 2 else 1 end;
  v_conf:=case v_tier when 4 then .85 when 3 then .70 when 2 then .50 else .30 end;

  v_payload:=
    (coalesce(p_input,'{}'::jsonb) - array['latitude','longitude']::text[])
    || jsonb_strip_nulls(jsonb_build_object(
      'observer_distance_m',v_distance,
      'observer_accuracy_m',v_accuracy,
      'server_validated_method',v_method
    ));

  insert into public.location_observations(
    location_id,observer_user_id,observation_type,observed_at,latitude,longitude,
    accuracy_m,evidence,confidence,source,expires_at
  )
  values(
    p_location_id,v_user,
    case when v_tier>=4 then 'community_observed' when v_tier>=3 then 'encountered' else 'discovered' end,
    now(),
    case when v_tier>=3 then v_lat end,
    case when v_tier>=3 then v_lon end,
    case when v_tier>=3 then v_accuracy end,
    v_payload,v_conf,'consumer_discovery_validated',now()+interval '30 days'
  )
  returning id into v_obs;

  if jsonb_typeof(p_input->'amenities')='array' then
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

  v_action:=case when v_amenity_count>0 then 'add_amenity' else 'helpful_contribution' end;
  v_xp:=public.record_progression_event_v2(
    v_action,
    jsonb_build_object(
      'location_id',p_location_id,
      'source_id',v_obs,
      'evidence_tier',v_tier,
      'amenities_recorded',v_amenity_count
    ),
    'evidence:'||v_obs::text
  );

  return jsonb_build_object(
    'observation_id',v_obs,
    'evidence_tier',v_tier,
    'confidence',v_conf,
    'observer_distance_m',v_distance,
    'amenities_recorded',v_amenity_count,
    'xp',v_xp
  );
end;
$$;

revoke all on function public.consumer_record_discovery_evidence(uuid,jsonb) from public,anon;
grant execute on function public.consumer_record_discovery_evidence(uuid,jsonb) to authenticated,service_role;
