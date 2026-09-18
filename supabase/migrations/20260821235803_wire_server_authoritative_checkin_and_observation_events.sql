create or replace function public.create_check_in(p_place_id uuid, p_qr_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_location uuid;
  v_check uuid;
  v_points integer := 10;
  v_existing uuid;
  v_qr uuid;
  v_event_key text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select location_id into v_location from public.places where id=p_place_id and is_active=true;
  if v_location is null then raise exception 'Place not found'; end if;

  if p_qr_token is not null and length(trim(p_qr_token))>0 then
    select id into v_qr from public.qr_codes where code=trim(p_qr_token) and active=true and location_id=v_location limit 1;
    if v_qr is null then raise exception 'Invalid or inactive QR code'; end if;
  end if;

  select id into v_existing from public.check_ins
  where user_id=v_user and location_id=v_location and checked_in_at > now()-interval '24 hours' limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok',true,'already_checked_in',true,'check_in_id',v_existing,'id',v_existing,'location_id',v_location,'points_awarded',0,'place_id',p_place_id);
  end if;

  insert into public.check_ins(user_id,location_id,qr_code_id,checked_in_at,verification_method,points_awarded,metadata)
  values(v_user,v_location,v_qr,now(),case when v_qr is null then 'place' else 'qr' end,v_points,jsonb_build_object('place_id',p_place_id))
  returning id into v_check;

  insert into public.reward_transactions(user_id,check_in_id,points,reason,metadata)
  values(v_user,v_check,v_points,'check_in',jsonb_build_object('place_id',p_place_id,'qr',v_qr is not null));

  update public.profiles
  set points=coalesce(points,0)+v_points,total_check_ins=coalesce(total_check_ins,0)+1,
      level=greatest(1,floor((coalesce(points,0)+v_points)/100)+1)::int,updated_at=now()
  where id=v_user;

  v_event_key := md5(concat_ws('|',v_user::text,'check_in',v_check::text,v_location::text));
  insert into public.data_feature_events(subject_type,subject_id,actor_user_id,location_id,event_type,feature_code,source_table,source_id,value_numeric,value_text,metadata,occurred_at,event_validity,confidence,deduplication_key,rate_limit_context)
  values('location',v_location,v_user,v_location,'check_in','location_checkin','check_ins',v_check,v_points,null,jsonb_build_object('place_id',p_place_id,'qr',v_qr is not null,'server_authoritative',true),now(),'valid',1,v_event_key,jsonb_build_object('server_authoritative',true));

  return jsonb_build_object('ok',true,'already_checked_in',false,'check_in_id',v_check,'id',v_check,'location_id',v_location,'points_awarded',v_points,'place_id',p_place_id);
end
$function$;

create or replace function public.submit_restroom_observation(p_location_id uuid, p_check_in_id uuid, p_observation_type text, p_cleanliness_pct numeric default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_observation public.restroom_observations;
  v_positive boolean := false;
  v_negative boolean := false;
  v_confidence numeric := 0.6;
  v_count integer;
  v_event_key text;
begin
  if v_user is null then raise exception 'Sign in to contribute an observation.'; end if;
  if p_observation_type not in ('clean','dirty','supplies_ok','supplies_low','open','closed','accessible','not_accessible','changing_table','no_changing_table','bathroom_present','bathroom_missing') then raise exception 'Invalid observation type.'; end if;
  if p_cleanliness_pct is not null and (p_cleanliness_pct < 0 or p_cleanliness_pct > 100) then raise exception 'Cleanliness must be between 0 and 100.'; end if;
  if p_check_in_id is not null and not exists (select 1 from public.check_ins where id=p_check_in_id and user_id=v_user and location_id=p_location_id) then raise exception 'Check-in does not belong to this location.'; end if;
  if p_check_in_id is not null then v_confidence := 0.9; end if;

  insert into public.restroom_observations(location_id,user_id,check_in_id,observation_type,cleanliness_pct,note,confidence)
  values(p_location_id,v_user,p_check_in_id,p_observation_type,p_cleanliness_pct,nullif(trim(p_note),''),v_confidence)
  returning * into v_observation;

  v_positive := p_observation_type in ('clean','supplies_ok','open','accessible','changing_table','bathroom_present');
  v_negative := p_observation_type in ('dirty','supplies_low','closed','not_accessible','no_changing_table','bathroom_missing');

  select count(*) into v_count from public.restroom_observations where location_id=p_location_id and created_at >= now() - interval '30 days';

  update public.locations
  set bathroom_verification_count = coalesce(bathroom_verification_count,0)+1,
      bathroom_positive_count = coalesce(bathroom_positive_count,0)+case when v_positive then 1 else 0 end,
      bathroom_negative_count = coalesce(bathroom_negative_count,0)+case when v_negative then 1 else 0 end,
      bathroom_verified_at = now(),
      bathroom_verification_status = case when v_negative and p_observation_type in ('closed','bathroom_missing') then 'reported_issue' else 'verified' end,
      bathroom_verification_source = 'community_observation',
      updated_at = now()
  where id=p_location_id;

  if v_count >= 2 and v_positive and v_negative then
    insert into public.location_data_conflicts(location_id,field_name,observed_value,source,observation_id)
    values(p_location_id,'bathroom_status','contradictory community observations','community',v_observation.id);
  end if;

  v_event_key := md5(concat_ws('|',v_user::text,'observation',v_observation.id::text,p_location_id::text));
  insert into public.data_feature_events(subject_type,subject_id,actor_user_id,location_id,event_type,feature_code,source_table,source_id,value_numeric,value_text,metadata,occurred_at,event_validity,confidence,deduplication_key,rate_limit_context)
  values('location',p_location_id,v_user,p_location_id,'observation','restroom_observation','restroom_observations',v_observation.id,p_cleanliness_pct,p_observation_type,jsonb_build_object('observation_type',p_observation_type,'check_in_id',p_check_in_id,'server_authoritative',true),now(),'valid',v_confidence,v_event_key,jsonb_build_object('server_authoritative',true));

  return jsonb_build_object('observation_id',v_observation.id,'verification_count',v_count,'confidence',v_confidence);
end;
$function$;
