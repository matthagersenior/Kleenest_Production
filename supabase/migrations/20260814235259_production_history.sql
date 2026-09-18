create or replace function private.current_user_business_role(p_business_id uuid)
returns public.business_member_role
language sql
security definer
stable
set search_path = ''
as $$
  select bm.role
  from public.business_members bm
  where bm.business_id = p_business_id
    and bm.user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function private.current_user_business_role(uuid) from public, anon, authenticated;

drop policy if exists business_members_self_select on public.business_members;
drop policy if exists business_members_owner_insert on public.business_members;
drop policy if exists business_members_owner_update on public.business_members;
drop policy if exists business_members_owner_delete on public.business_members;

create policy business_members_self_select
on public.business_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.current_user_business_role(business_id) in ('owner','admin','manager')
);

create policy business_members_owner_insert
on public.business_members
for insert to authenticated
with check (
  private.current_user_business_role(business_id) in ('owner','admin')
  and role <> 'owner'
);

create policy business_members_owner_update
on public.business_members
for update to authenticated
using (
  private.current_user_business_role(business_id) in ('owner','admin')
)
with check (
  private.current_user_business_role(business_id) in ('owner','admin')
  and role <> 'owner'
);

create policy business_members_owner_delete
on public.business_members
for delete to authenticated
using (
  role <> 'owner'
  and private.current_user_business_role(business_id) in ('owner','admin')
);
