create or replace function public.business_list_workspaces(p_include_demo boolean default false)
returns table(
  id uuid,
  business_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  business_name text,
  name text,
  business_tier text,
  is_demo_test boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with member_rows as (
    select
      b.id,
      b.id as business_id,
      bm.user_id,
      bm.role::text,
      bm.created_at,
      b.name as business_name,
      b.name,
      b.business_tier::text,
      coalesce(b.is_demo_test,false) as is_demo_test
    from public.business_members bm
    join public.businesses b on b.id = bm.business_id
    where bm.user_id = auth.uid()
  ), demo_rows as (
    select
      b.id,
      b.id as business_id,
      null::uuid as user_id,
      'owner'::text as role,
      b.created_at,
      b.name as business_name,
      b.name,
      b.business_tier::text,
      coalesce(b.is_demo_test,false) as is_demo_test
    from public.businesses b
    where p_include_demo
      and public.is_platform_owner_session()
      and coalesce(b.is_demo_test,false)
      and b.verification_status::text = 'verified'
  )
  select * from member_rows
  union all
  select d.* from demo_rows d
  where not exists (select 1 from member_rows m where m.business_id = d.business_id)
  order by created_at asc;
$$;

revoke all on function public.business_list_workspaces(boolean) from public;
grant execute on function public.business_list_workspaces(boolean) to authenticated;

comment on function public.business_list_workspaces(boolean) is 'Canonical authenticated authority for Business workspace membership and platform-owner demo workspace discovery.';
