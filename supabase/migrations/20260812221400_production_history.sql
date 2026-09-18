drop policy if exists business_members_owner_insert on public.business_members;
drop policy if exists business_members_owner_update on public.business_members;
drop policy if exists business_members_owner_delete on public.business_members;

create policy business_members_owner_insert on public.business_members
for insert to authenticated
with check (
  exists (select 1 from public.business_members bm where bm.business_id = business_members.business_id and bm.user_id = (select auth.uid()) and bm.role = 'owner'::public.business_member_role)
  and business_members.role <> 'owner'::public.business_member_role
);

create policy business_members_owner_update on public.business_members
for update to authenticated
using (
  exists (select 1 from public.business_members bm where bm.business_id = business_members.business_id and bm.user_id = (select auth.uid()) and bm.role = 'owner'::public.business_member_role)
)
with check (
  business_members.role <> 'owner'::public.business_member_role
  and exists (select 1 from public.business_members bm where bm.business_id = business_members.business_id and bm.user_id = (select auth.uid()) and bm.role = 'owner'::public.business_member_role)
);

create policy business_members_owner_delete on public.business_members
for delete to authenticated
using (
  business_members.role <> 'owner'::public.business_member_role
  and exists (select 1 from public.business_members bm where bm.business_id = business_members.business_id and bm.user_id = (select auth.uid()) and bm.role = 'owner'::public.business_member_role)
);

create or replace function public.business_update_member_role(p_business_id uuid,p_user_id uuid,p_role public.business_member_role)
returns public.business_members language plpgsql security invoker set search_path=public
as $$
declare v public.business_members;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_user_id = auth.uid() then raise exception 'You cannot change your own business role'; end if;
 if p_role = 'owner'::public.business_member_role then raise exception 'Ownership changes require an owner transfer workflow'; end if;
 if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and role='owner'::public.business_member_role) then raise exception 'Only the business owner can change member roles'; end if;
 update public.business_members set role=p_role where business_id=p_business_id and user_id=p_user_id returning * into v;
 if not found then raise exception 'Business member not found'; end if;
 return v;
end;
$$;
revoke execute on function public.business_update_member_role(uuid,uuid,public.business_member_role) from public;
grant execute on function public.business_update_member_role(uuid,uuid,public.business_member_role) to authenticated;
