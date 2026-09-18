-- Persist onboarding drafts and expose one canonical Business/Fleet managed-location portfolio.
-- Direct locations remain editable by their Business. Active Enterprise partner-network
-- locations are visible as portfolio scope without pretending the owner Business owns them.

create or replace function public.business_onboarding_save_draft_v2(
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
  v_preview jsonb;
  v_experience jsonb;
  v_version integer;
begin
  if auth.uid() is null or not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;

  v_preview:=public.business_onboarding_preview_v2(
    p_business_id,p_business_type,p_goals,coalesce(p_scale,'{}'::jsonb),coalesce(p_answers,'{}'::jsonb)
  );
  v_experience:=coalesce(v_preview->'experience','{}'::jsonb);
  select onboarding_version into v_version
  from public.business_onboarding_policy
  where singleton=true;

  insert into public.business_onboarding_profiles(
    business_id,business_type,goals,scale,recommended_products,preview,
    applied_setup,completed_at,created_by,created_at,updated_at,
    answers,experience,onboarding_version
  )
  values(
    p_business_id,
    lower(trim(p_business_type)),
    array(select jsonb_array_elements_text(coalesce(v_preview->'goals','[]'::jsonb))),
    coalesce(p_scale,'{}'::jsonb),
    array(select jsonb_array_elements_text(coalesce(v_preview->'recommended_products','[]'::jsonb))),
    v_preview,
    '{}'::jsonb,
    null,
    auth.uid(),
    now(),
    now(),
    coalesce(p_answers,'{}'::jsonb),
    v_experience,
    coalesce(v_version,2)
  )
  on conflict(business_id) do update set
    business_type=excluded.business_type,
    goals=excluded.goals,
    scale=excluded.scale,
    recommended_products=excluded.recommended_products,
    preview=excluded.preview,
    answers=excluded.answers,
    experience=excluded.experience,
    onboarding_version=excluded.onboarding_version,
    updated_at=now();

  return v_preview||jsonb_build_object(
    'draft_saved',true,
    'draft_saved_at',now(),
    'completed',exists(
      select 1
      from public.business_onboarding_profiles p
      where p.business_id=p_business_id and p.completed_at is not null
    )
  );
end;
$$;
revoke all on function public.business_onboarding_save_draft_v2(uuid,text,text[],jsonb,jsonb) from public,anon;
grant execute on function public.business_onboarding_save_draft_v2(uuid,text,text[],jsonb,jsonb) to authenticated,service_role;

create or replace function public.business_managed_location_portfolio(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_enterprise boolean;
begin
  if auth.uid() is null or not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;

  v_enterprise:=public.business_enterprise_authorized(p_business_id);

  with direct_location_ids as (
    select l.id
    from public.locations l
    where l.business_id=p_business_id
       or l.claimed_business_id=p_business_id
       or exists(
         select 1
         from public.location_claims c
         where c.location_id=l.id
           and c.business_id=p_business_id
           and c.status='approved'
       )
  ),
  active_networks as (
    select n.id,n.name
    from public.enterprise_partner_networks n
    where v_enterprise
      and n.owner_business_id=p_business_id
      and coalesce(n.enabled,true)
  ),
  active_partners as (
    select distinct m.partner_business_id,a.id network_id,a.name network_name
    from active_networks a
    join public.enterprise_partner_network_members m
      on m.network_id=a.id
     and m.status='active'
  ),
  direct_rows as (
    select
      l.id as location_id,
      l.id,
      'direct'::text as scope,
      p_business_id as portfolio_owner_business_id,
      coalesce(l.claimed_business_id,l.business_id) as managed_business_id,
      b.name as managed_business_name,
      null::uuid as network_id,
      null::text as network_name,
      l.name,l.address,l.city,l.state,l.postal_code,l.latitude,l.longitude,
      l.place_type,l.rating,l.review_count,l.bathroom_verification_status,
      l.geofence_radius_m,l.is_active,l.created_at
    from public.locations l
    join direct_location_ids d on d.id=l.id
    left join public.businesses b on b.id=coalesce(l.claimed_business_id,l.business_id)
  ),
  network_rows as (
    select distinct on(l.id)
      l.id as location_id,
      l.id,
      'network'::text as scope,
      p_business_id as portfolio_owner_business_id,
      ap.partner_business_id as managed_business_id,
      b.name as managed_business_name,
      ap.network_id,
      ap.network_name,
      l.name,l.address,l.city,l.state,l.postal_code,l.latitude,l.longitude,
      l.place_type,l.rating,l.review_count,l.bathroom_verification_status,
      l.geofence_radius_m,l.is_active,l.created_at
    from active_partners ap
    join public.businesses b on b.id=ap.partner_business_id
    join public.locations l on coalesce(l.claimed_business_id,l.business_id)=ap.partner_business_id
    where not exists(select 1 from direct_location_ids d where d.id=l.id)
    order by l.id,ap.network_name
  ),
  all_rows as (
    select * from direct_rows
    union all
    select * from network_rows
  ),
  partner_count as (
    select count(distinct partner_business_id)::integer n from active_partners
  )
  select jsonb_build_object(
    'business_id',p_business_id,
    'enterprise_enabled',v_enterprise,
    'locations',coalesce((
      select jsonb_agg(
        to_jsonb(r)
        order by case when r.scope='direct' then 0 else 1 end,
                 r.managed_business_name,r.name
      )
      from all_rows r
    ),'[]'::jsonb),
    'summary',jsonb_build_object(
      'direct_location_count',(select count(*) from direct_rows where coalesce(is_active,true)),
      'network_location_count',(select count(*) from network_rows where coalesce(is_active,true)),
      'portfolio_location_count',(select count(*) from all_rows where coalesce(is_active,true)),
      'partner_business_count',(select n from partner_count),
      'network_count',(select count(*) from active_networks)
    )
  )
  into v_result;

  return coalesce(v_result,jsonb_build_object(
    'business_id',p_business_id,
    'enterprise_enabled',v_enterprise,
    'locations','[]'::jsonb,
    'summary',jsonb_build_object(
      'direct_location_count',0,
      'network_location_count',0,
      'portfolio_location_count',0,
      'partner_business_count',0,
      'network_count',0
    )
  ));
end;
$$;
revoke all on function public.business_managed_location_portfolio(uuid) from public,anon;
grant execute on function public.business_managed_location_portfolio(uuid) to authenticated,service_role;

comment on function public.business_onboarding_save_draft_v2(uuid,text,text[],jsonb,jsonb) is
  'Persists detailed onboarding answers/preview as a draft so Business and Fleet can recognize onboarding progress before final apply.';
comment on function public.business_managed_location_portfolio(uuid) is
  'Returns direct/claimed Business locations plus active Enterprise partner-network locations with direct vs network scope labels.';
