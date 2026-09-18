update public.feature_catalog set minimum_tier='free' where feature_code in ('advanced_routes','bathroom_deep_verification');

comment on column public.feature_catalog.minimum_tier is 'Capability boundary for the feature. Consumer features use free so Free and Premium share the complete consumer feature set; monetization is advertising vs ad-free subscription. Business, fleet, enterprise, and admin remain separately authorized.';

create or replace function public.consumer_ads_enabled(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path to public, auth, extensions, pg_temp
as $$
  select case
    when p_user_id is null then true
    when exists (
      select 1 from public.app_profile p
      where p.id = p_user_id
        and lower(coalesce(p.subscription_tier::text,'free')) in ('premium','plus','pro')
    ) then false
    else true
  end;
$$;

revoke all on function public.consumer_ads_enabled(uuid) from public;
grant execute on function public.consumer_ads_enabled(uuid) to authenticated;

create or replace function public.consumer_feature_access(p_feature_code text, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path to public, auth, extensions, pg_temp
as $$
  select case
    when not exists (select 1 from public.feature_catalog f where f.feature_code=p_feature_code and f.enabled) then false
    when exists (select 1 from public.feature_catalog f where f.feature_code=p_feature_code and f.category in ('business','fleet','enterprise','admin')) then false
    else true
  end;
$$;

revoke all on function public.consumer_feature_access(text,uuid) from public;
grant execute on function public.consumer_feature_access(text,uuid) to authenticated;
