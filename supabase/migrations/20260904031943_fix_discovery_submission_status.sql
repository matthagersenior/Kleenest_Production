create or replace function public.consumer_match_or_create_discovery(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_name text:=nullif(btrim(p_input->>'name'),'');
  v_address text:=nullif(btrim(p_input->>'address'),'');
  v_lat double precision:=nullif(p_input->>'latitude','')::double precision;
  v_lon double precision:=nullif(p_input->>'longitude','')::double precision;
  v_method text:=coalesce(nullif(p_input->>'method',''),'remote');
  v_loc public.locations%rowtype;
  v_new boolean:=false;
  v_tier integer;
  v_conf numeric;
  v_state text;
  v_contrib uuid;
  v_xp jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if v_method not in ('remote','address','place_search','map_pin','gps','onsite_live') then raise exception 'invalid discovery method'; end if;
  if v_name is null and v_address is null and (v_lat is null or v_lon is null) then raise exception 'name, address, or coordinates required'; end if;
  select * into v_loc from public.locations l
  where l.is_active is distinct from false and (
    (v_lat is not null and v_lon is not null and l.latitude between v_lat-0.001 and v_lat+0.001 and l.longitude between v_lon-0.001 and v_lon+0.001 and (v_name is null or lower(l.name)=lower(v_name)))
    or (v_address is not null and lower(coalesce(l.address,''))=lower(v_address) and (v_name is null or lower(l.name)=lower(v_name)))
    or (nullif(p_input->>'external_id','') is not null and l.source_external_id=p_input->>'external_id' and (p_input->>'external_source' is null or l.source_dataset=p_input->>'external_source'))
  ) order by l.verification_confidence desc nulls last,l.created_at asc limit 1;
  if v_loc.id is null then
    insert into public.locations(name,address,latitude,longitude,place_type,source,source_dataset,source_external_id,source_metadata,created_by,is_active)
    values(coalesce(v_name,'Community discovery'),v_address,v_lat,v_lon,coalesce(p_input->>'place_type','place'),'community_discovery',p_input->>'external_source',p_input->>'external_id',jsonb_build_object('discovery_method',v_method,'submitted_payload',p_input),v_user,true)
    returning * into v_loc;
    v_new:=true;
  end if;
  v_tier:=case v_method when 'onsite_live' then 4 when 'gps' then 3 when 'map_pin' then 2 when 'address' then 2 when 'place_search' then 2 else 1 end;
  v_conf:=case v_tier when 4 then .80 when 3 then .65 when 2 then .45 else .25 end;
  v_state:=case when v_tier>=4 then 'on_site_observed' when v_tier>=2 then 'located' else 'candidate' end;
  insert into public.discovery_contributions(location_id,user_id,method,discovery_state,evidence_tier,confidence,payload)
  values(v_loc.id,v_user,v_method,v_state,v_tier,v_conf,p_input) returning id into v_contrib;
  insert into public.location_submissions(location_id,submitted_by,payload,status)
  values(v_loc.id,v_user,p_input||jsonb_build_object('discovery_contribution_id',v_contrib,'method',v_method,'evidence_tier',v_tier),'pending_review');
  v_xp:=public.record_progression_event_v2(case v_method when 'onsite_live' then 'discover_onsite_live' when 'gps' then 'discover_gps' when 'map_pin' then 'discover_map_pin' when 'address' then 'discover_address' else 'discover_remote' end,
    jsonb_build_object('location_id',v_loc.id,'source_id',v_contrib,'evidence_tier',v_tier,'new_location',v_new), 'discovery:'||v_contrib::text);
  return jsonb_build_object('location_id',v_loc.id,'matched_existing',not v_new,'discovery_id',v_contrib,'discovery_state',v_state,'evidence_tier',v_tier,'confidence',v_conf,'xp',v_xp);
end $$;
