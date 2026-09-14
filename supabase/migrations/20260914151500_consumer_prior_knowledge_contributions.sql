create or replace function public.consumer_submit_prior_knowledge(
  p_location_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_location public.locations%rowtype;
  v_recency text := lower(trim(coalesce(p_input->>'knowledge_recency','unknown')));
  v_observed_at timestamptz;
  v_confidence numeric;
  v_facts jsonb := coalesce(p_input->'facts','[]'::jsonb);
  v_cleanliness text := lower(trim(coalesce(p_input->>'cleanliness_tendency','unknown')));
  v_access_notes text := nullif(trim(coalesce(p_input->>'access_notes','')),'');
  v_notes text := nullif(trim(coalesce(p_input->>'notes','')),'');
  v_observation_id uuid;
  v_progression jsonb := null;
  v_evidence jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb)) <> 'object' then
    raise exception 'PRIOR_KNOWLEDGE_MUST_BE_OBJECT';
  end if;

  select * into v_location
  from public.locations
  where id = p_location_id and coalesce(is_active,true);
  if not found then raise exception 'LOCATION_NOT_AVAILABLE'; end if;

  if v_recency not in ('today','this_week','this_month','few_months','long_time','unknown') then
    raise exception 'INVALID_KNOWLEDGE_RECENCY';
  end if;
  if v_cleanliness not in ('usually_spotless','usually_clean','mixed','often_needs_attention','unknown') then
    raise exception 'INVALID_CLEANLINESS_TENDENCY';
  end if;
  if jsonb_typeof(v_facts) <> 'array' then raise exception 'FACTS_MUST_BE_ARRAY'; end if;
  if jsonb_array_length(v_facts) > 20 then raise exception 'TOO_MANY_FACTS'; end if;
  if length(coalesce(v_access_notes,'')) > 500 then raise exception 'ACCESS_NOTES_TOO_LONG'; end if;
  if length(coalesce(v_notes,'')) > 1200 then raise exception 'NOTES_TOO_LONG'; end if;
  if jsonb_array_length(v_facts)=0 and v_cleanliness='unknown' and v_access_notes is null and v_notes is null then
    raise exception 'ADD_SOMETHING_YOU_KNOW';
  end if;

  -- Recency is intentionally conservative. It is a user's historical claim,
  -- never a current-device presence timestamp.
  v_observed_at := case v_recency
    when 'today' then date_trunc('day',now())
    when 'this_week' then now()-interval '7 days'
    when 'this_month' then now()-interval '30 days'
    when 'few_months' then now()-interval '120 days'
    when 'long_time' then now()-interval '365 days'
    else now()-interval '730 days'
  end;

  v_confidence := case v_recency
    when 'today' then 0.35
    when 'this_week' then 0.30
    when 'this_month' then 0.25
    when 'few_months' then 0.20
    when 'long_time' then 0.15
    else 0.10
  end;

  v_evidence := jsonb_build_object(
    'evidence_class','prior_knowledge',
    'knowledge_recency',v_recency,
    'claimed_observed_at',v_observed_at,
    'submitted_at',now(),
    'facts',v_facts,
    'cleanliness_tendency',v_cleanliness,
    'access_notes',v_access_notes,
    'notes',v_notes,
    'presence_verified',false,
    'visit_verified',false,
    'freshness_eligible',false,
    'canonical_amenity_evidence',false,
    'server_validated',true
  );

  insert into public.location_observations(
    location_id,
    observer_user_id,
    observation_type,
    observed_at,
    latitude,
    longitude,
    accuracy_m,
    evidence,
    confidence,
    source,
    expires_at
  )
  values(
    p_location_id,
    v_user,
    'discovered',
    v_observed_at,
    null,
    null,
    null,
    v_evidence,
    v_confidence,
    'consumer_prior_knowledge',
    now()+interval '365 days'
  )
  returning id into v_observation_id;

  -- Prior knowledge can earn contribution credit, but never visit/check-in credit.
  -- The daily per-location key prevents repeated submissions from farming progression.
  v_progression := public.record_progression_event_v2(
    'helpful_contribution',
    jsonb_build_object(
      'location_id',p_location_id,
      'source_id',v_observation_id,
      'evidence_tier',1,
      'evidence_class','prior_knowledge',
      'presence_verified',false,
      'visit_verified',false
    ),
    'prior-knowledge:'||v_user::text||':'||p_location_id::text||':'||to_char(now(),'YYYY-MM-DD')
  );

  return jsonb_build_object(
    'observation_id',v_observation_id,
    'location_id',p_location_id,
    'evidence_class','prior_knowledge',
    'knowledge_recency',v_recency,
    'claimed_observed_at',v_observed_at,
    'confidence',v_confidence,
    'presence_verified',false,
    'visit_verified',false,
    'freshness_eligible',false,
    'canonical_amenity_observations',0,
    'progression',v_progression
  );
end;
$$;

revoke all on function public.consumer_submit_prior_knowledge(uuid,jsonb) from public,anon;
grant execute on function public.consumer_submit_prior_knowledge(uuid,jsonb) to authenticated,service_role;

comment on function public.consumer_submit_prior_knowledge(uuid,jsonb) is
'Records user-declared historical location knowledge without creating presence, a check-in, a verified visit, or canonical fresh amenity evidence.';
