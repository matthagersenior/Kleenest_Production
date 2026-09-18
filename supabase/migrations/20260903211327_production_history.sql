create or replace function public.fleet_observe_access(p_business_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $function$
  select auth.uid() is not null
     and coalesce((select a.fleet_enabled from public.get_business_product_access(p_business_id) a limit 1),false);
$function$;

create or replace function public.has_fleet_access(p_business_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $function$
  select public.fleet_observe_access(p_business_id);
$function$;

grant execute on function public.has_fleet_access(uuid) to authenticated, service_role;

create or replace function public.business_enterprise_authorized(p_business_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
  select auth.uid() is not null
     and public.business_can_manage(p_business_id)
     and coalesce((select a.enterprise_enabled from public.get_business_product_access(p_business_id) a limit 1),false);
$function$;

grant execute on function public.business_enterprise_authorized(uuid) to authenticated, service_role;
