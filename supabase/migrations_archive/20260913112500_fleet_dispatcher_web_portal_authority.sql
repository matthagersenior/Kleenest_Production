-- Fleet web portal authority for organization operators.
-- The dispatcher role is intentionally Fleet-scoped: it can operate routing /
-- dispatch surfaces without inheriting unrelated Business-wide management.

alter type public.business_member_role add value if not exists 'dispatcher';

create or replace function public.fleet_actor_is_manager(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $$
  select public.is_platform_owner_session()
    or exists (
      select 1
      from public.business_members bm
      where bm.business_id=p_business_id
        and bm.user_id=auth.uid()
        and lower(bm.role::text) in (
          'owner','admin','manager','dispatcher',
          'fleet_owner','fleet_manager','fleet_dispatcher',
          'enterprise_owner','enterprise_admin','enterprise_manager'
        )
    );
$$;

revoke all on function public.fleet_actor_is_manager(uuid) from public,anon;
grant execute on function public.fleet_actor_is_manager(uuid) to authenticated,service_role;

create or replace function public.business_fleet_authorized(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null
     and public.fleet_actor_is_manager(p_business_id)
     and public.fleet_product_enabled(p_business_id);
$$;

revoke all on function public.business_fleet_authorized(uuid) from public,anon;
grant execute on function public.business_fleet_authorized(uuid) to authenticated,service_role;

comment on function public.fleet_actor_is_manager(uuid) is
  'Fleet operator authority for owners, admins, managers and dispatchers. Dispatcher is Fleet-scoped and does not imply general Business management.';
comment on function public.business_fleet_authorized(uuid) is
  'Returns Fleet control-plane access for an authenticated Fleet operator on a Fleet-enabled business.';


create or replace function public.fleet_onboarding_gate(p_business_id uuid)
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
  if auth.uid() is null or not public.fleet_actor_is_manager(p_business_id) then
    raise exception 'Fleet operator access required';
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

revoke all on function public.fleet_onboarding_gate(uuid) from public,anon;
grant execute on function public.fleet_onboarding_gate(uuid) to authenticated,service_role;

comment on function public.fleet_onboarding_gate(uuid) is
  'Fleet operator-readable onboarding gate. Owners/admins retain completion authority while managers/dispatchers can enter the Fleet web portal after required onboarding is complete.';


create or replace function public.business_tier_offer_catalog()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'tiers',jsonb_build_array(
    jsonb_build_object(
      'id','standard','label','Business Standard','price_cents',2000,'billing_unit','account_month',
      'price_note','$20/month','max_locations',1,'premium_users',0,
      'includes',jsonb_build_array('Core profile','1 location','Reviews & replies','Basic QR','Basic analytics')
    ),
    jsonb_build_object(
      'id','growth','label','Business Growth','price_cents',5000,'billing_unit','location_month',
      'price_note','$50/location/month; up to 5 locations','max_locations',5,'premium_users',0,
      'includes',jsonb_build_array('Standard','Growth campaigns','Promotions','Contests','QR Studio','Advanced analytics','Intelligence')
    ),
    jsonb_build_object(
      'id','fleet','label','Fleet','price_cents',7500,'billing_unit','account_month',
      'price_note','$75/month; includes 75 Premium users','max_locations',5,'premium_users',75,
      'includes',jsonb_build_array('Business Growth tools','Fleet routing','Dispatch','Field execution','Fleet analytics','75 Premium users')
    ),
    jsonb_build_object(
      'id','enterprise','label','Business Enterprise','price_cents',49900,'billing_unit','band_month',
      'price_note','From $499/month + $1,500 onboarding','max_locations',null,'premium_users',null,
      'includes',jsonb_build_array('Business Growth tools','Enterprise networks','Portfolio controls','Partner campaigns','Allocations','Cross-location intelligence','Fleet add-on available')
    )
  ),
  'upgrade_paths',jsonb_build_object(
    'standard',jsonb_build_array('growth','fleet','enterprise'),
    'growth',jsonb_build_array('fleet_addon','fleet','enterprise'),
    'fleet',jsonb_build_array('enterprise_keep_fleet'),
    'enterprise',jsonb_build_array('fleet_addon')
  ),
  'addon_pricing',jsonb_build_object(
    'fleet',jsonb_build_object('status','not_separately_finalized','note','Fleet add-on entitlement is supported; separate incremental add-on price remains intentionally unset.'),
    'enterprise',jsonb_build_object('status','band_priced','note','Enterprise uses the canonical location-band pricing schedule.')
  )
);
$$;

revoke all on function public.business_tier_offer_catalog() from public,anon;
grant execute on function public.business_tier_offer_catalog() to authenticated,service_role;

comment on function public.business_tier_offer_catalog() is
  'Canonical Business commercial tier catalog. Fleet includes 75 Consumer Premium seats by default.';
