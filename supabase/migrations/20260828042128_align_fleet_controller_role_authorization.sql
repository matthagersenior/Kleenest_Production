create or replace function public.fleet_actor_is_manager(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $function$
  select public.is_platform_owner_session()
    or exists (
      select 1
      from public.business_members bm
      where bm.business_id=p_business_id
        and bm.user_id=auth.uid()
        and lower(bm.role::text) in (
          'owner','admin','manager',
          'fleet_owner','fleet_manager',
          'enterprise_owner','enterprise_admin','enterprise_manager'
        )
    );
$function$;
