-- Mandatory versioned Business onboarding with targeted post-onboarding experience.

alter table public.business_onboarding_profiles
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists experience jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_version integer not null default 1;

create table if not exists public.business_onboarding_policy(
  singleton boolean primary key default true check(singleton),
  required_after timestamptz not null,
  onboarding_version integer not null default 2,
  mandatory boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.business_onboarding_policy(singleton,required_after,onboarding_version,mandatory)
values(true,'2026-09-11 06:40:00+00',2,true)
on conflict(singleton) do update set
  required_after=excluded.required_after,
  onboarding_version=greatest(public.business_onboarding_policy.onboarding_version,excluded.onboarding_version),
  mandatory=true,
  updated_at=now();

alter table public.business_onboarding_policy enable row level security;
revoke all on table public.business_onboarding_policy from public,anon,authenticated;
grant select,insert,update,delete on table public.business_onboarding_policy to service_role;

create or replace function public.business_onboarding_build_experience(
  p_business_type text,
  p_goals text[],
  p_scale jsonb default '{}'::jsonb,
  p_answers jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_type text:=lower(trim(coalesce(p_business_type,'other')));
  v_goals text[]:=coalesce(p_goals,'{}'::text[]);
  v_pains text[]:=array(select jsonb_array_elements_text(coalesce(p_answers->'pain_points','[]'::jsonb)));
  v_team text[]:=array(select jsonb_array_elements_text(coalesce(p_answers->'team_focus','[]'::jsonb)));
  v_metrics text[]:=array(select jsonb_array_elements_text(coalesce(p_answers->'success_metrics','[]'::jsonb)));
  v_routes text[]:=array['/profile','/locations'];
  v_focus text[]:='{}';
  v_route text;
  v_headline text;
  v_mode text;
begin
  foreach v_route in array case
    when v_goals && array['restroom_trust','reduce_downtime'] then array['/operations','/prevention','/trust-operations']
    else '{}'::text[] end
  loop if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if; end loop;

  foreach v_route in array case
    when v_goals && array['verified_feedback'] then array['/reviews','/qr-studio']
    else '{}'::text[] end
  loop if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if; end loop;

  foreach v_route in array case
    when v_goals && array['increase_visits','loyalty_repeat','promotions_events'] then array['/growth','/engagement','/qr-studio','/analytics','/intelligence']
    else '{}'::text[] end
  loop if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if; end loop;

  foreach v_route in array case
    when v_goals && array['multi_location_consistency'] then array['/enterprise-locations','/governance','/analytics']
    else '{}'::text[] end
  loop if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if; end loop;

  foreach v_route in array case
    when v_goals && array['route_efficiency','workforce_wellbeing','service_verification'] then array['/live-network','/operations','/analytics']
    else '{}'::text[] end
  loop if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if; end loop;

  foreach v_route in array case
    when v_goals && array['partner_network','multi_market_roi'] then array['/enterprise','/enterprise-economy','/partners','/analytics']
    else '{}'::text[] end
  loop if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if; end loop;

  if v_pains && array['restroom_complaints','cleanliness_inconsistency','restroom_downtime'] then
    foreach v_route in array array['/operations','/prevention'] loop
      if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if;
    end loop;
  end if;
  if v_pains && array['weak_reviews','low_repeat_visits','low_visit_conversion'] then
    foreach v_route in array array['/reviews','/growth','/qr-studio'] loop
      if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if;
    end loop;
  end if;
  if v_pains && array['route_delays','workforce_stop_access'] then
    foreach v_route in array array['/live-network','/operations'] loop
      if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if;
    end loop;
  end if;

  if 'marketing'=any(v_team) then
    foreach v_route in array array['/growth','/analytics'] loop if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if; end loop;
  end if;
  if 'operations'=any(v_team) or 'facilities'=any(v_team) then
    foreach v_route in array array['/operations','/prevention'] loop if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if; end loop;
  end if;
  if 'customer_experience'=any(v_team) then
    foreach v_route in array array['/reviews','/qr-studio'] loop if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if; end loop;
  end if;
  if 'analytics'=any(v_team) or 'executive'=any(v_team) then
    foreach v_route in array array['/analytics','/intelligence','/governance'] loop if not v_route=any(v_routes) then v_routes:=array_append(v_routes,v_route); end if; end loop;
  end if;

  if v_goals && array['route_efficiency','workforce_wellbeing','service_verification'] then
    v_mode:='mobile_operations';
  elsif v_goals && array['partner_network','multi_market_roi'] or coalesce((p_scale->>'markets')::integer,0)>1 then
    v_mode:='multi_market';
  elsif coalesce((p_scale->>'locations')::integer,0)>1 then
    v_mode:='multi_location';
  else
    v_mode:='location_growth';
  end if;

  v_headline:=case v_type
    when 'restaurant_cafe' then 'Turn trusted visits into repeat local traffic.'
    when 'retail' then 'Make customer access, trust and repeat visits measurable.'
    when 'fuel_travel' then 'Make every roadside stop easier to trust and operate.'
    when 'hospitality' then 'Connect guest experience, restroom trust and service recovery.'
    when 'healthcare_public' then 'Prioritize reliable access, verification and operational response.'
    when 'logistics_delivery' then 'Reduce route friction and improve mobile-worker stop decisions.'
    when 'field_service' then 'Coordinate mobile work, stop access and service evidence.'
    when 'multi_location_chain' then 'Create consistent location operations with portfolio-level visibility.'
    when 'venue_entertainment' then 'Handle peak traffic, guest trust and event-driven engagement.'
    else 'Focus Kleenest on the outcomes your operation cares about most.'
  end;

  if array_length(v_metrics,1) is not null then v_focus:=v_metrics; else v_focus:=v_goals; end if;

  return jsonb_build_object(
    'headline',v_headline,
    'operating_mode',v_mode,
    'targeted_routes',to_jsonb(v_routes),
    'recommended_focus',to_jsonb(v_focus),
    'customer_profile',coalesce(p_answers->>'customer_profile','general_public'),
    'access_model',coalesce(p_answers->>'access_model','mixed'),
    'traffic_pattern',coalesce(p_answers->>'traffic_pattern','steady'),
    'qr_intent',coalesce(p_answers->'qr_intent','[]'::jsonb),
    'reporting_cadence',coalesce(p_answers->>'reporting_cadence','weekly'),
    'team_focus',coalesce(p_answers->'team_focus','[]'::jsonb)
  );
end;
$$;

create or replace function public.business_onboarding_preview_v2(
  p_business_id uuid,
  p_business_type text,
  p_goals text[],
  p_scale jsonb default '{}'::jsonb,
  p_answers jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb;
  v_experience jsonb;
  v_version integer;
begin
  v_base:=public.business_onboarding_preview(p_business_id,p_business_type,p_goals,p_scale);
  v_experience:=public.business_onboarding_build_experience(p_business_type,p_goals,p_scale,p_answers);
  select onboarding_version into v_version from public.business_onboarding_policy where singleton=true;
  return v_base||jsonb_build_object(
    'answers',coalesce(p_answers,'{}'::jsonb),
    'experience',v_experience,
    'targeted_routes',v_experience->'targeted_routes',
    'onboarding_version',coalesce(v_version,2)
  );
end;
$$;
revoke all on function public.business_onboarding_preview_v2(uuid,text,text[],jsonb,jsonb) from public,anon;
grant execute on function public.business_onboarding_preview_v2(uuid,text,text[],jsonb,jsonb) to authenticated,service_role;

create or replace function public.business_onboarding_apply_v2(
  p_business_id uuid,
  p_business_type text,
  p_goals text[],
  p_scale jsonb default '{}'::jsonb,
  p_answers jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_preview jsonb;
  v_experience jsonb;
  v_version integer;
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Business owner or admin access required'; end if;
  v_result:=public.business_onboarding_apply(p_business_id,p_business_type,p_goals,p_scale);
  v_preview:=public.business_onboarding_preview_v2(p_business_id,p_business_type,p_goals,p_scale,p_answers);
  v_experience:=v_preview->'experience';
  select onboarding_version into v_version from public.business_onboarding_policy where singleton=true;

  update public.business_onboarding_profiles
  set answers=coalesce(p_answers,'{}'::jsonb),
      experience=coalesce(v_experience,'{}'::jsonb),
      onboarding_version=coalesce(v_version,2),
      preview=v_preview,
      completed_at=now(),
      updated_at=now()
  where business_id=p_business_id;

  return v_result||jsonb_build_object(
    'preview',v_preview,
    'experience',v_experience,
    'targeted_routes',v_experience->'targeted_routes',
    'onboarding_version',coalesce(v_version,2)
  );
end;
$$;
revoke all on function public.business_onboarding_apply_v2(uuid,text,text[],jsonb,jsonb) from public,anon;
grant execute on function public.business_onboarding_apply_v2(uuid,text,text[],jsonb,jsonb) to authenticated,service_role;

create or replace function public.business_onboarding_gate(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_business public.businesses;
  v_profile public.business_onboarding_profiles;
  v_policy public.business_onboarding_policy;
  v_required boolean;
  v_completed boolean;
begin
  if auth.uid() is null or not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;

  select * into v_business from public.businesses where id=p_business_id;
  if v_business.id is null then raise exception 'Business not found'; end if;
  select * into v_profile from public.business_onboarding_profiles where business_id=p_business_id;
  select * into v_policy from public.business_onboarding_policy where singleton=true;

  v_completed:=v_profile.completed_at is not null
    and coalesce(v_profile.onboarding_version,0)>=coalesce(v_policy.onboarding_version,2);

  v_required:=coalesce(v_policy.mandatory,true)
    and not coalesce(v_business.is_demo_test,false)
    and v_business.created_at>=coalesce(v_policy.required_after,'2026-09-11 06:40:00+00'::timestamptz)
    and not v_completed;

  return jsonb_build_object(
    'business_id',p_business_id,
    'mandatory',coalesce(v_policy.mandatory,true),
    'required',v_required,
    'completed',v_completed,
    'can_complete',public.business_admin_guard(p_business_id),
    'required_after',v_policy.required_after,
    'onboarding_version',coalesce(v_policy.onboarding_version,2),
    'completed_version',coalesce(v_profile.onboarding_version,0),
    'completed_at',v_profile.completed_at,
    'recommended',not v_completed
  );
end;
$$;
revoke all on function public.business_onboarding_gate(uuid) from public,anon;
grant execute on function public.business_onboarding_gate(uuid) to authenticated,service_role;

comment on function public.business_onboarding_gate(uuid) is
  'Mandatory onboarding gate for every newly created non-demo Business workspace after business_onboarding_policy.required_after.';
