drop function if exists public.submit_restroom_observation(uuid,text,numeric,text,uuid);

create or replace function public.submit_restroom_observation(
  p_location_id uuid,
  p_check_in_id uuid,
  p_observation_type text,
  p_cleanliness_pct numeric default null,
  p_note text default null
)
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
  return jsonb_build_object('observation_id',v_observation.id,'verification_count',v_count,'confidence',v_confidence);
end;
$function$;
