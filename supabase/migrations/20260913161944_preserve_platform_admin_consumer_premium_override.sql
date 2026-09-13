
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
      exists(
        select 1 from public.profiles p
        where p.id=auth.uid()
          and (coalesce(p.is_platform_owner,false) or coalesce(p.is_admin,false))
      )
      or coalesce((
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
