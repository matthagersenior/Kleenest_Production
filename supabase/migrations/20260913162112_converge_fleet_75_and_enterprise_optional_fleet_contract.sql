
update public.enterprise_pricing_bands
set included_premium_seats=0,
    updated_at=now()
where included_premium_seats<>0;

update public.subscription_plans
set name='Fleet (Premium Users ≤75 Users)',
    max_family_members=75,
    features=jsonb_set(
      jsonb_set(coalesce(features,'{}'::jsonb),'{max_users}','75'::jsonb,true),
      '{premium_users}','true'::jsonb,true
    )
where code='fleet';

create or replace function public.business_enterprise_pricing_quote(p_location_count integer)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_requested integer:=greatest(6,coalesce(p_location_count,6));
  v_band public.enterprise_pricing_bands;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_band
  from public.enterprise_pricing_bands b
  where b.active and b.location_count>=v_requested
  order by b.location_count
  limit 1;

  if v_band.location_count is null then
    return jsonb_build_object(
      'requested_locations',v_requested,
      'custom_quote',true,
      'band_locations',null,
      'monthly_price_cents',null,
      'onboarding_fee_cents',150000,
      'included_premium_seats',0,
      'fleet_addon_available',true,
      'fleet_premium_seats_when_enabled',75,
      'price_note','Custom Enterprise quote above 250 locations; Fleet is an optional add-on'
    );
  end if;

  return jsonb_build_object(
    'requested_locations',v_requested,
    'custom_quote',false,
    'band_locations',v_band.location_count,
    'monthly_price_cents',v_band.monthly_price_cents,
    'onboarding_fee_cents',v_band.onboarding_fee_cents,
    'annual_recurring_cents',v_band.annual_recurring_cents,
    'first_year_cents',v_band.first_year_cents,
    'included_premium_seats',0,
    'fleet_addon_available',true,
    'fleet_premium_seats_when_enabled',75,
    'price_note',format(
      '$%s/month + $1,500 onboarding; Fleet optional',
      trim(to_char(v_band.monthly_price_cents/100.0,'FM999G999G990'))
    )
  );
end;
$$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='business_onboarding_preview'
    and pg_get_function_identity_arguments(p.oid)='p_business_id uuid, p_business_type text, p_goals text[], p_scale jsonb'
  limit 1;

  v_def:=replace(v_def,'50 Premium users','75 Premium users');
  v_def:=replace(v_def,'50-user Fleet Premium workforce access','75-user Fleet Premium workforce access');
  v_def:=replace(
    v_def,
    '''fleet_premium_users'',case when v_recommended=''fleet'' or ''fleet''=any(v_addons) then 50 else 0 end',
    '''fleet_premium_users'',case when v_recommended=''fleet'' or ''fleet''=any(v_addons) then 75 else 0 end'
  );
  execute v_def;
end $$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='business_tier_qualification_snapshot'
    and pg_get_function_identity_arguments(p.oid)='p_business_id uuid'
  limit 1;

  v_def:=replace(v_def,'Fleet includes Business Growth tools and 50 Premium users.','Fleet includes Business Growth tools and 75 Premium users.');
  execute v_def;
end $$;
