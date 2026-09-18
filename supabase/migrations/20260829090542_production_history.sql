create or replace function public.is_platform_owner_session()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        coalesce(p.is_platform_owner, false)
        or coalesce(p.is_admin, false)
        or lower(coalesce(p.role::text, '')) in ('owner','platform_admin','super_admin','admin')
      )
  );
$$;

create policy businesses_platform_owner_select
on public.businesses
for select
to authenticated
using (public.is_platform_owner_session());
