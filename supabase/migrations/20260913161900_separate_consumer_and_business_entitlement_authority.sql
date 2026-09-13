
create or replace function public.get_current_user_product_entitlements()
returns table(
  service_tier text,
  location_limit integer,
  fleet_enabled boolean,
  enterprise_fleet_enabled boolean
)
language sql
stable
security definer
set search_path=''
as $$
with me as (
  select p.id,p.subscription_tier::text tier,
         coalesce(p.is_admin,false) is_admin,
         coalesce(p.is_platform_owner,false) is_platform_owner,
         lower(coalesce(p.role::text,'')) role
  from public.profiles p
  where p.id=auth.uid()
),
candidate_businesses as (
  select bm.business_id
  from public.business_members bm
  where bm.user_id=auth.uid()
  union
  select d.business_id
  from public.fleet_drivers d
  where d.user_id=auth.uid()
    and lower(coalesce(d.status,'active')) not in ('deleted','revoked')
  union
  select m.business_id
  from public.fleet_premium_memberships m
  where m.user_id=auth.uid() and m.status='active'
),
business_access as (
  select
    coalesce(bool_or(coalesce(e.fleet_enabled,b.business_tier='fleet')),false) any_fleet,
    coalesce(bool_or(
      coalesce(e.fleet_enabled,b.business_tier='fleet')
      and coalesce(e.enterprise_enabled,b.business_tier='enterprise')
    ),false) any_enterprise_fleet
  from candidate_businesses c
  join public.businesses b on b.id=c.business_id
  left join public.business_service_entitlements e on e.business_id=b.id
),
account_row as (
  select
    coalesce(m.tier,'free')::text service_tier,
    null::integer location_limit,
    coalesce(a.any_fleet,false) fleet_enabled,
    coalesce(a.any_enterprise_fleet,false) enterprise_fleet_enabled
  from me m cross join business_access a
),
admin_row as (
  select
    'admin'::text service_tier,
    null::integer location_limit,
    true fleet_enabled,
    true enterprise_fleet_enabled
  from me m
  where m.is_admin or m.is_platform_owner or m.role in ('admin','platform_admin','super_admin')
)
select * from account_row
union all
select * from admin_row;
$$;

revoke all on function public.get_current_user_product_entitlements() from public,anon;
grant execute on function public.get_current_user_product_entitlements() to authenticated,service_role;

create or replace function public.has_kleenest_premium()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case
    when auth.uid() is null then false
    else
      coalesce((
        select
          (u.raw_app_meta_data->>'premiumEntitlement')='active'
          or (u.raw_app_meta_data->>'premiumOwnership')='lifetime'
          or lower(coalesce(u.raw_app_meta_data->>'subscriptionLevel','')) in ('premium','family')
        from auth.users u
        where u.id=auth.uid()
      ),false)
      or exists(
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.subscription_tier::text in ('premium','family')
      )
      or public.family_has_premium_access(auth.uid())
      or exists(
        select 1 from public.fleet_premium_memberships m
        where m.user_id=auth.uid() and m.status='active'
      )
  end;
$$;

revoke all on function public.has_kleenest_premium() from public,anon;
grant execute on function public.has_kleenest_premium() to authenticated,service_role;

create or replace function public.sync_stripe_subscription_entitlement(
  p_user_id uuid,
  p_plan_code text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan text:=lower(trim(coalesce(p_plan_code,'')));
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_tier public.subscription_tier;
  v_catalog_code text;
  v_active boolean:=v_status in ('active','trialing','past_due');
begin
  if session_user<>'postgres' and coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'service_role required' using errcode='42501';
  end if;
  if p_user_id is null or not exists(select 1 from public.profiles p where p.id=p_user_id) then
    raise exception 'Kleenest user not found';
  end if;

  if v_plan in ('premium','premium_user') then
    v_tier:='premium';
    v_catalog_code:='premium_user';
  elsif v_plan='family' then
    v_tier:='family';
    v_catalog_code:='family';
  elsif v_plan='free' then
    v_tier:='free';
    v_catalog_code:='free';
  elsif v_plan in ('fleet','enterprise','business','business_standard','business_growth','business_enterprise','business_fleet','fleet_addon') then
    raise exception 'Business plan codes require business-scoped entitlement sync';
  else
    raise exception 'Unsupported consumer plan code: %',p_plan_code;
  end if;

  delete from public.user_feature_entitlements
   where user_id=p_user_id and source='stripe_subscription';

  if v_active then
    update public.profiles
       set subscription_tier=v_tier,updated_at=now()
     where id=p_user_id;

    insert into public.user_feature_entitlements(
      user_id,feature_code,tier_code,enabled,source,updated_at
    )
    select
      p_user_id,
      f.value,
      v_tier::text,
      true,
      'stripe_subscription',
      now()
    from public.pricing_catalog pc
    cross join lateral jsonb_array_elements_text(coalesce(pc.features,'[]'::jsonb)) f(value)
    where pc.code=v_catalog_code and pc.category='consumer' and pc.active
    on conflict(user_id,feature_code) do update set
      tier_code=excluded.tier_code,
      enabled=true,
      source=excluded.source,
      updated_at=now();
  else
    update public.profiles
       set subscription_tier='free',updated_at=now()
     where id=p_user_id
       and subscription_tier=v_tier;
  end if;
end;
$$;

revoke all on function public.sync_stripe_subscription_entitlement(uuid,text,text) from public,anon,authenticated;
grant execute on function public.sync_stripe_subscription_entitlement(uuid,text,text) to service_role;

create or replace function public.enable_enterprise_fleet_service(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if session_user<>'postgres' and coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'service_role required' using errcode='42501';
  end if;
  raise exception 'Legacy user-scoped Fleet enablement is retired; use business-scoped admin_set_business_access(business_id,...)';
end;
$$;

revoke all on function public.enable_enterprise_fleet_service(uuid) from public,anon,authenticated;
grant execute on function public.enable_enterprise_fleet_service(uuid) to service_role;

comment on function public.get_current_user_product_entitlements() is
  'Compatibility account entitlement surface. Consumer/account tier is user-scoped; Fleet flags only indicate existence of a real business-scoped Fleet workspace and are not authorization.';
comment on function public.sync_stripe_subscription_entitlement(uuid,text,text) is
  'Consumer-only Stripe entitlement sync. Business plan codes must use business-scoped billing/entitlement authority.';
comment on function public.enable_enterprise_fleet_service(uuid) is
  'Retired user-scoped business Fleet entitlement shim; always raises and directs callers to business-scoped access control.';
