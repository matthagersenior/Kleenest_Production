create or replace function public.submit_restroom_observation(
  p_location_id uuid,
  p_check_in_id uuid,
  p_observation_type text,
  p_cleanliness_pct numeric default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_location public.locations%rowtype;
  v_observation public.restroom_observations;
  v_check public.check_ins%rowtype;
  v_positive boolean := false;
  v_negative boolean := false;
  v_confidence numeric := 0.6;
  v_count integer;
  v_event_key text;
  v_progression_key text;
  v_progression public.progression_metric_events;
  v_progression_eligible boolean := false;
begin
  if v_user is null then raise exception 'Sign in to contribute an observation.'; end if;
  if p_location_id is null then raise exception 'Canonical location is required.'; end if;
  select * into v_location from public.locations where id=p_location_id and is_active=true;
  if not found then raise exception 'Canonical location not found or inactive.'; end if;
  if p_observation_type not in ('clean','dirty','supplies_ok','supplies_low','open','closed','accessible','not_accessible','changing_table','no_changing_table','bathroom_present','bathroom_missing') then raise exception 'Invalid observation type.'; end if;
  if p_cleanliness_pct is not null and (p_cleanliness_pct<0 or p_cleanliness_pct>100) then raise exception 'Cleanliness must be between 0 and 100.'; end if;

  if p_check_in_id is not null then
    select * into v_check from public.check_ins where id=p_check_in_id;
    if not found or v_check.user_id<>v_user or v_check.location_id<>p_location_id then raise exception 'Check-in does not belong to this user and canonical location.'; end if;
    if coalesce(v_check.verification_method,'') not in ('gps','qr','place') then raise exception 'Check-in is not a verified visit.'; end if;
    if v_check.checked_in_at>now()+interval '5 minutes' then raise exception 'Check-in timestamp is not valid.'; end if;
    if exists(select 1 from public.location_departures d where d.user_id=v_user and d.location_id=p_location_id and d.left_at>v_check.checked_in_at and d.left_at<=now()) then raise exception 'Check-in is no longer an active visit.'; end if;
    v_confidence:=0.9;
    -- Use the return-visit overload without p_check_in_id: the four-argument form
    -- intentionally becomes false after the check-in itself receives its reward.
    -- Evidence has its own progression event and must be idempotent independently.
    v_progression_eligible:=public.is_qualifying_return_visit(v_user,p_location_id,v_check.checked_in_at);
  end if;

  insert into public.restroom_observations(location_id,user_id,check_in_id,observation_type,cleanliness_pct,note,source,confidence)
  values(p_location_id,v_user,p_check_in_id,p_observation_type,p_cleanliness_pct,nullif(trim(p_note),''),case when p_check_in_id is null then 'community_observation' else 'verified_visit_observation' end,v_confidence)
  returning * into v_observation;

  v_positive:=p_observation_type in ('clean','supplies_ok','open','accessible','changing_table','bathroom_present');
  v_negative:=p_observation_type in ('dirty','supplies_low','closed','not_accessible','no_changing_table','bathroom_missing');
  select count(*) into v_count from public.restroom_observations where location_id=p_location_id and created_at>=now()-interval '30 days';

  update public.locations set bathroom_verification_count=coalesce(bathroom_verification_count,0)+1,bathroom_positive_count=coalesce(bathroom_positive_count,0)+case when v_positive then 1 else 0 end,bathroom_negative_count=coalesce(bathroom_negative_count,0)+case when v_negative then 1 else 0 end,bathroom_verified_at=now(),bathroom_verification_status=case when v_negative and p_observation_type in ('closed','bathroom_missing') then 'reported_issue' else 'verified' end,bathroom_verification_source='community_observation',updated_at=now() where id=p_location_id;

  if v_count>=2 and v_positive and v_negative then
    insert into public.location_data_conflicts(location_id,field_name,observed_value,source,observation_id) values(p_location_id,'bathroom_status','contradictory community observations','community',v_observation.id);
  end if;

  v_event_key:=md5(concat_ws('|',v_user::text,'observation',v_observation.id::text,p_location_id::text));
  insert into public.data_feature_events(subject_type,subject_id,actor_user_id,location_id,event_type,feature_code,source_table,source_id,value_numeric,value_text,metadata,occurred_at,event_validity,confidence,deduplication_key,rate_limit_context)
  values('location',p_location_id,v_user,p_location_id,'observation','restroom_observation','restroom_observations',v_observation.id,p_cleanliness_pct,p_observation_type,jsonb_build_object('observation_type',p_observation_type,'check_in_id',p_check_in_id,'provenance',case when p_check_in_id is null then 'community_observation' else 'verified_visit_observation' end,'server_authoritative',true,'progression_eligible',v_progression_eligible),now(),'valid',v_confidence,v_event_key,jsonb_build_object('server_authoritative',true,'progression_eligible',v_progression_eligible));

  if v_progression_eligible and p_check_in_id is not null then
    v_progression_key:=md5(concat_ws('|',v_user::text,'restroom_observation',p_check_in_id::text,p_location_id::text));
    v_progression:=public.record_progression_metric_event('verification','verification',v_observation.id,1,15,jsonb_build_object('idempotency_key',v_progression_key,'location_id',p_location_id,'check_in_id',p_check_in_id,'evidence_id',v_observation.id,'evidence_type','restroom_observation','server_authoritative',true));
  end if;

  return jsonb_build_object('observation_id',v_observation.id,'verification_count',v_count,'confidence',v_confidence,'location_id',p_location_id,'check_in_id',p_check_in_id,'provenance',case when p_check_in_id is null then 'community_observation' else 'verified_visit_observation' end,'progression_eligible',v_progression_eligible,'progression_awarded',coalesce(v_progression.points_awarded,0),'progression_event_id',v_progression.id);
end;
$$;
