create or replace function public.has_fleet_access(p_business_id uuid)
returns boolean
language sql
stable
set search_path to 'public','pg_catalog'
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id=auth.uid()),false)
      or exists(
        select 1
        from public.business_members bm
        join public.businesses b on b.id=bm.business_id
        where bm.business_id=p_business_id
          and bm.user_id=auth.uid()
          and bm.role in ('owner','admin','manager')
          and b.business_tier='fleet'::public.business_tier
      )
$$;

create or replace function public.fleet_actor_is_manager(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id=auth.uid()),false)
      or exists(
        select 1
        from public.business_members bm
        where bm.business_id=p_business_id
          and bm.user_id=auth.uid()
          and lower(bm.role::text) in ('owner','admin','manager')
      );
$$;
