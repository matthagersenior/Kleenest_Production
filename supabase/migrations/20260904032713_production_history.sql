insert into public.amenities(name,category) values
 ('Public Restroom','Restroom'),('Stalls','Fixtures'),('Urinals','Fixtures'),('Sinks','Fixtures'),('24-hour Access','Hours')
on conflict(name) do nothing;

create or replace function public.consumer_record_discovery_evidence(p_location_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_method text:=coalesce(nullif(p_input->>'method',''),'remote');
  v_tier integer;
  v_conf numeric;
  v_obs uuid;
  v_action text;
  v_xp jsonb;
  v_contrib uuid;
  v_amenity_name text;
  v_amenity_id uuid;
  v_amenity_count integer:=0;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.locations where id=p_location_id) then raise exception 'location not found'; end if;

  v_tier:=case v_method when 'onsite_live' then 4 when 'gps' then 3 when 'photo_remote' then 2 else 1 end;
  v_conf:=case v_tier when 4 then .85 when 3 then .70 when 2 then .50 else .30 end;

  insert into public.location_observations(
    location_id,observer_user_id,observation_type,observed_at,latitude,longitude,accuracy_m,evidence,confidence,source
  ) values(
    p_location_id,v_user,
    case when v_tier>=4 then 'community_observed' when v_tier>=3 then 'encountered' else 'discovered' end,
    now(),nullif(p_input->>'latitude','')::double precision,nullif(p_input->>'longitude','')::double precision,
    nullif(p_input->>'accuracy_m','')::double precision,p_input,v_conf,'consumer_discovery'
  ) returning id into v_obs;

  if jsonb_typeof(p_input->'amenities')='array' then
    for v_amenity_name in select jsonb_array_elements_text(p_input->'amenities') loop
      select a.id into v_amenity_id from public.amenities a
      where lower(a.name)=lower(v_amenity_name)
         or (lower(v_amenity_name)='accessible stall' and lower(a.name)='accessible stall')
         or (lower(v_amenity_name)='changing table' and lower(a.name)='changing table')
         or (lower(v_amenity_name)='family restroom' and lower(a.name)='family restroom')
         or (lower(v_amenity_name)='24-hour access' and lower(a.name) in ('24-hour access','24 hours'))
      order by case when lower(a.name)=lower(v_amenity_name) then 0 else 1 end
      limit 1;
      if v_amenity_id is not null then
        insert into public.location_amenity_observations(
          location_id,user_id,amenity_id,status,confidence,verification_method,notes,observed_at,metadata
        ) values(
          p_location_id,v_user,v_amenity_id,'present',v_conf,
          case when v_tier>=4 then 'on_site_live' when v_tier>=3 then 'gps' else 'community_discovery' end,
          nullif(p_input->>'access_notes',''),now(),
          jsonb_build_object('location_observation_id',v_obs,'evidence_tier',v_tier,'source','consumer_discovery')
        );
        v_amenity_count:=v_amenity_count+1;
      end if;
      v_amenity_id:=null;
    end loop;
  end if;

  select id into v_contrib from public.discovery_contributions
  where location_id=p_location_id and user_id=v_user order by created_at desc limit 1;
  if v_contrib is null then
    insert into public.discovery_contributions(location_id,user_id,method,discovery_state,evidence_tier,confidence,payload)
    values(
      p_location_id,v_user,case when v_method in ('gps','onsite_live') then v_method else 'remote' end,
      case when v_tier>=4 then 'on_site_observed' else 'documented' end,v_tier,v_conf,p_input
    ) returning id into v_contrib;
  else
    update public.discovery_contributions
    set evidence_tier=greatest(evidence_tier,v_tier),confidence=greatest(confidence,v_conf),
        discovery_state=case when v_tier>=4 then 'on_site_observed' else case when discovery_state='candidate' then 'documented' else discovery_state end end,
        payload=payload||p_input,updated_at=now()
    where id=v_contrib;
  end if;

  v_action:=case
    when coalesce((p_input->>'accessibility')::boolean,false) then 'add_accessibility'
    when p_input ? 'photo_path' or p_input ? 'photo_url' then 'add_photo'
    when v_amenity_count>0 then 'add_amenity'
    else 'helpful_contribution'
  end;
  v_xp:=public.record_progression_event_v2(
    v_action,
    jsonb_build_object('location_id',p_location_id,'source_id',v_obs,'evidence_tier',v_tier,'amenities_recorded',v_amenity_count),
    'evidence:'||v_obs::text
  );

  return jsonb_build_object(
    'observation_id',v_obs,'evidence_tier',v_tier,'confidence',v_conf,
    'amenities_recorded',v_amenity_count,'xp',v_xp
  );
end $$;
grant execute on function public.consumer_record_discovery_evidence(uuid,jsonb) to authenticated;
