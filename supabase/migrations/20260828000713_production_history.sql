create or replace function public.fleet_observe_access(p_business_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $$
  select public.is_platform_owner(auth.uid())
    or exists (
      select 1
      from public.business_members bm
      join public.businesses b on b.id=bm.business_id
      where bm.business_id=p_business_id
        and bm.user_id=auth.uid()
        and lower(b.business_tier::text) in ('fleet','enterprise')
    );
$$;

revoke all on function public.fleet_observe_access(uuid) from public;
grant execute on function public.fleet_observe_access(uuid) to authenticated;

create or replace function public.has_fleet_access(p_business_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $$
  select public.fleet_observe_access(p_business_id);
$$;

create or replace function public.get_fleet_metric_configuration(p_business_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $$
  select jsonb_build_object(
    'business_id',p_business_id,
    'definitions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from public.fleet_metric_definitions d where d.business_id=p_business_id),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.fleet_metric_assignments a where a.business_id=p_business_id and a.active),'[]'::jsonb)
  )
  where public.fleet_observe_access(p_business_id);
$$;

comment on function public.fleet_observe_access(uuid) is 'Fleet read/workspace access. Any authenticated member of a Fleet or Enterprise business may observe shared fleet resources; mutation authority remains separately enforced by fleet_actor_is_manager/fleet_metric_controller_authorized.';
comment on function public.has_fleet_access(uuid) is 'Compatibility alias for Fleet read/workspace access. Do not use as mutation authorization.';
