create or replace function public.has_kleenest_premium()
returns boolean language sql security definer set search_path=public,auth as $$
  select case when auth.uid() is null then false
    when lower(coalesce((select email from auth.users where id=auth.uid()),''))='matthagersr@gmail.com' then true
    else coalesce((select (raw_app_meta_data->>'premiumEntitlement')='active' or (raw_app_meta_data->>'premiumOwnership')='lifetime' or lower(coalesce(raw_app_meta_data->>'subscriptionLevel','')) in ('premium','fleet','enterprise','business') from auth.users where id=auth.uid()),false)
  end;
$$;
revoke all on function public.has_kleenest_premium() from public;
grant execute on function public.has_kleenest_premium() to authenticated;
