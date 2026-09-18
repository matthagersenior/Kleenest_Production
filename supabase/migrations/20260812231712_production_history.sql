create schema if not exists private;

create or replace function private.business_transfer_ownership_impl(p_business_id uuid, p_new_owner_id uuid)
returns public.business_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.business_members;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role='owner') then raise exception 'Only the current owner can transfer ownership'; end if;
  if p_new_owner_id=auth.uid() then raise exception 'New owner must be a different user'; end if;
  if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=p_new_owner_id) then raise exception 'New owner must already be a business member'; end if;
  update public.business_members set role='admin' where business_id=p_business_id and user_id=auth.uid();
  update public.business_members set role='owner' where business_id=p_business_id and user_id=p_new_owner_id returning * into v;
  return v;
end;
$$;

revoke all on function private.business_transfer_ownership_impl(uuid,uuid) from public, anon, authenticated;

create or replace function public.business_transfer_ownership(p_business_id uuid, p_new_owner_id uuid)
returns public.business_members
language plpgsql
security invoker
set search_path = 'public'
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role='owner') then raise exception 'Only the current owner can transfer ownership'; end if;
  return private.business_transfer_ownership_impl(p_business_id,p_new_owner_id);
end;
$$;

revoke execute on function public.business_transfer_ownership(uuid,uuid) from public, anon;
grant execute on function public.business_transfer_ownership(uuid,uuid) to authenticated;
